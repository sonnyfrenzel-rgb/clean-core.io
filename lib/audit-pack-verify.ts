/**
 * Audit Pack Verification Engine (v1.17.0)
 *
 * Validates the integrity and authenticity of exported Audit Pack ZIP files.
 * Checks file SHA-256 hashes against the manifest, verifies the manifest hash,
 * and optionally validates the HMAC-SHA256 signature via the server.
 */

import JSZip from 'jszip';
import type { AuditPackManifest } from './audit-pack';
import { canonicalAuditManifest } from './audit-pack-canonical';

/**
 * SHA-256 of bytes, or of the UTF-8 bytes of a string, using the Web Crypto API.
 *
 * Archive entries are handed in as bytes. They used to be read with
 * `async('text')` and hashed after decoding, which measures the text a UTF-8
 * decoder produced rather than the bytes the issuer sealed: an invalid sequence
 * decodes to U+FFFD and encodes back as the three bytes of U+FFFD, so an entry
 * whose bytes were changed to something undecodable came out with the digest of
 * an entry that genuinely held that character — and the pack was reported as
 * authentic over bytes nobody signed. The issuer hashes the UTF-8 bytes of the
 * string it wrote (`/api/audit-pack/create`) and the offline verifier hashes the
 * entry's bytes, so hashing bytes here is the same number on every genuine pack
 * and the only one that answers the question the page asks.
 */
async function sha256(content: string | Uint8Array): Promise<string> {
  // The copy in the byte branch is a type adjustment, not a transformation:
  // `crypto.subtle` wants a view over a plain ArrayBuffer and JSZip's is typed
  // over the wider `ArrayBufferLike`. The bytes are the bytes either way.
  const msgBuffer = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


/**
 * An entry name as JSZip will key it.
 *
 * JSZip resolves `.` and `..` inside a path before it puts the entry in its map,
 * so `x/../manifest.json` and `manifest.json` are one key to it and two names in
 * the central directory. Comparing the raw names therefore missed exactly the
 * case this check exists for: two entries JSZip collapses into one, of which an
 * ordinary extractor would write the *other* (QA review of fce34641821e). The
 * names are compared after the same resolution, so an alias counts as the
 * duplicate it is.
 */
export function zipKey(name: string): string {
  // Measured against JSZip 3 on 21.09.2026, because guessing the rule is how the
  // first version of this got it wrong: `/manifest.json` keeps its leading
  // slash and is a *different* entry from `manifest.json`, `//a` collapses to
  // `/a`, `a//b` to `a/b`, `.` segments vanish, `..` pops and stops at the root
  // (`a/../../b.json` is `b.json`). Dropping the leading slash, as this did
  // first, would have merged two entries JSZip keeps apart and failed a genuine
  // pack (QA review of 351e169c50a7).
  const rooted = name.startsWith('/');
  const out: string[] = [];
  for (const part of name.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  const body = out.join('/') + (name.endsWith('/') && out.length ? '/' : '');
  return rooted ? `/${body}` : body || '/';
}

/**
 * Names the archive's central directory lists more than once.
 *
 * JSZip holds a loaded archive in a map keyed by name, so two entries under one
 * name arrive as one — the later overwrites the earlier — and both the
 * completeness check and the hash below then see a single file. An archive can
 * therefore carry a second entry under a signed path: the check hashes the one
 * JSZip kept, the manifest agrees, the signature agrees, and an extractor that
 * takes the first entry hands the reader the other one. The manifest names each
 * path once, so an archive that lists one twice is not the archive that was
 * sealed, whichever of the two is the genuine file.
 *
 * Read straight from the bytes, because the question cannot be asked of the map.
 * An archive this cannot count — no end-of-central-directory record, a ZIP64
 * marker, a record that is not where the previous one said it ends — returns
 * nothing rather than a guess: the other checks still apply, and a verifier must
 * not fail a genuine pack over a shape it simply did not parse.
 *
 * The names are compared through `zipKey`, below, for the reason written there.
 */
function duplicateEntryNames(data: unknown): string[] {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) bytes = data;
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else return [];
  if (bytes.byteLength < 22) return [];

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const floor = Math.max(0, bytes.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  // The ZIP64 markers. An audit pack is a handful of small files, so this is a
  // shape we do not issue and do not pretend to have counted.
  if (total === 0xffff || offset === 0xffffffff) return [];

  const decoder = new TextDecoder();
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (let n = 0; n < total; n++) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL) return [];
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (offset + 46 + nameLength > bytes.byteLength) return [];
    const raw = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const name = zipKey(raw);
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return [...duplicates].sort();
}

export interface FileVerifyResult {
  path: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
  found: boolean;
  /**
   * False for a file the manifest lists as user-attested — the account holder's
   * own statement, never server evidence. Absent (true) for every signed file.
   *
   * From manifest version 3 such a row carries a real `expectedHash`, and
   * `valid` means the sealed bytes are the bytes in the archive. On a version-2
   * pack both hashes are empty and `valid` only says the file was there; the
   * reader is told so in `errors`, and the page labels the row differently.
   */
  signed?: boolean;
}

export interface VerifyResult {
  /**
   * True only for a pack this platform actually signed.
   *
   * It used to be true for `integrity-only` as well, which means a ZIP anyone
   * could assemble — arbitrary files, matching SHA-256 values, `signed: false`,
   * a consistent manifest hash — came back `success: true`. A caller reading the
   * documented boolean would show a successful verification for a pack with no
   * authenticity whatsoever. Local checksum consistency is a real and separate
   * fact, so it gets its own field rather than being folded into this one.
   */
  success: boolean;
  /** Files match the manifest and the manifest hash is consistent. Says nothing about origin. */
  integrityValid: boolean;
  status: 'authentic' | 'integrity-only' | 'failed';
  fileIntegrity: FileVerifyResult[];
  manifestHashValid: boolean;
  signatureValid: boolean | null; // null = unsigned or verification skipped
  manifest: AuditPackManifest | null;
  errors: string[];
}

/**
 * Verify an Audit Pack ZIP blob.
 *
 * 1. Extracts and parses manifest.json
 * 2. Verifies SHA-256 hashes of all listed files
 * 3. Verifies the manifest hash (canonical string)
 * 4. Optionally verifies the HMAC signature via /api/export/verify
 */
export async function verifyAuditPack(zipBlob: Blob | Buffer | Uint8Array): Promise<VerifyResult> {
  const errors: string[] = [];
  const fileResults: FileVerifyResult[] = [];
  let manifest: AuditPackManifest | null = null;
  let manifestHashValid = false;
  let signatureValid: boolean | null = null;

  try {
    // 1. Load ZIP (converting Blobs to ArrayBuffer for Node.js compatibility in tests)
    let inputData: any = zipBlob;
    if (zipBlob && typeof (zipBlob as any).arrayBuffer === 'function') {
      inputData = await (zipBlob as any).arrayBuffer();
    }
    const zip = await JSZip.loadAsync(inputData);

    // 2. Extract manifest.json
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return {
        success: false,
      integrityValid: false,
        status: 'failed',
        fileIntegrity: [],
        manifestHashValid: false,
        signatureValid: null,
        manifest: null,
        errors: ['manifest.json not found in ZIP. This may be an Audit Pack v1 (pre-v1.17) without integrity verification.'],
      };
    }

    const manifestText = await manifestFile.async('text');
    try {
      manifest = JSON.parse(manifestText) as AuditPackManifest;
    } catch {
      return {
        success: false,
      integrityValid: false,
        status: 'failed',
        fileIntegrity: [],
        manifestHashValid: false,
        signatureValid: null,
        manifest: null,
        errors: ['manifest.json contains invalid JSON.'],
      };
    }

    // 3. Verify file integrity — in both directions.
    //
    // The loop below checks that every file the manifest lists is present and
    // unchanged. It says nothing about files the manifest does not list, and
    // that is where a pack could be padded: take a legitimately signed archive,
    // add a file next to the evidence, and every listed hash, the manifest hash
    // and the signature still agree. The page then reads "Authenticity &
    // Integrity Verified" over an archive containing material nobody signed.
    // So the archive has to match the manifest exactly: an entry the manifest
    // does not account for is an integrity failure, not a curiosity.
    const attested = Array.isArray(manifest.attested) ? manifest.attested : [];
    const listed = new Set([...manifest.files.map((f) => f.path), ...attested.map((a) => a.path)]);
    const unlisted = Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name !== 'manifest.json' && !listed.has(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const name of unlisted) {
      fileResults.push({ path: name, expectedHash: '', actualHash: '', valid: false, found: true });
      errors.push(`File not covered by the manifest: ${name}`);
    }

    // The same rule, asked of the raw archive rather than of the loaded map: a
    // path the archive carries twice is an entry the manifest does not account
    // for, and only one of the two can be the file it names.
    const duplicates = duplicateEntryNames(inputData);
    for (const name of duplicates) {
      errors.push(`The archive lists ${name} more than once; the manifest names it once.`);
    }

    // A user-attested file carries the account holder's own statement, so it is
    // reported as exactly that and never as server evidence. From manifest
    // version 3 the issuer also records its SHA-256 and binds it into the
    // signature: which self-declaration was sealed is a fact about the archive,
    // and leaving it unbound meant anyone holding a genuine pack could rewrite
    // "sign-off: not given" into a fabricated board approval and still get
    // "Authenticity & Integrity Verified" (QA full review of a19945ef01dc).
    // Packs sealed in version 2 have no digest to check; that limit is said out
    // loud rather than passed off as a verified file.
    for (const a of attested) {
      const file = zip.file(a.path);
      if (!file) {
        fileResults.push({ path: a.path, expectedHash: a.sha256 || '', actualHash: '', valid: false, found: false, signed: false });
        errors.push(`Attested file missing from ZIP: ${a.path}`);
        continue;
      }
      if (!a.sha256) {
        fileResults.push({ path: a.path, expectedHash: '', actualHash: '', valid: true, found: true, signed: false });
        errors.push(`Attested file not covered by a digest in this pack's manifest version: ${a.path}. Its presence was sealed, its contents were not.`);
        continue;
      }
      const actualHash = await sha256(await file.async('uint8array'));
      const valid = actualHash === a.sha256;
      fileResults.push({ path: a.path, expectedHash: a.sha256, actualHash, valid, found: true, signed: false });
      if (!valid) {
        errors.push(`Hash mismatch for attested file ${a.path}: expected ${a.sha256.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`);
      }
    }

    for (const entry of manifest.files) {
      const file = zip.file(entry.path);
      if (!file) {
        fileResults.push({
          path: entry.path,
          expectedHash: entry.sha256,
          actualHash: '',
          valid: false,
          found: false,
        });
        errors.push(`File missing from ZIP: ${entry.path}`);
        continue;
      }

      const actualHash = await sha256(await file.async('uint8array'));
      const valid = actualHash === entry.sha256;

      fileResults.push({
        path: entry.path,
        expectedHash: entry.sha256,
        actualHash,
        valid,
        found: true,
      });

      if (!valid) {
        errors.push(`Hash mismatch for ${entry.path}: expected ${entry.sha256.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`);
      }
    }

    // 4. Verify manifest hash — rebuilt by the same function the issuer used.
    //
    // The rebuild can refuse: a manifest whose paths carry the separators the
    // canonical form uses has no single canonical string, and two different
    // file lists can then hash to the same signed bytes. No issuer ever wrote
    // such a name, so refusing one is refusing a forgery — including on a pack
    // sealed in the old format, which is why the hole is closed for packs
    // already delivered and not only for new ones.
    let canonicalManifest: string | null = null;
    try {
      canonicalManifest = canonicalAuditManifest({
        files: manifest.files,
        attested,
        projectId: manifest.projectId,
        runId: manifest.runId,
        runHash: manifest.runHash,
        engineVersion: manifest.engineVersion,
        sapApiCatalogVersion: manifest.sapApiCatalogVersion,
        version: manifest.version,
        generatedAt: manifest.generatedAt,
      });
    } catch (err: any) {
      errors.push(err?.message || 'This manifest has no unambiguous canonical form.');
    }

    if (canonicalManifest !== null) {
      const computedManifestHash = await sha256(canonicalManifest);
      manifestHashValid = computedManifestHash === manifest.manifestHash;

      if (!manifestHashValid) {
        errors.push(`Manifest hash mismatch: expected ${manifest.manifestHash.substring(0, 16)}..., got ${computedManifestHash.substring(0, 16)}...`);
      }
    }

    // 5. Verify HMAC signature via server
    if (canonicalManifest !== null && manifest.signed && manifest.signature) {
      try {
        const verifyResponse = await fetch('/api/export/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canonicalManifest,
            signature: manifest.signature,
          }),
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          signatureValid = verifyData.valid === true;
          if (!signatureValid) {
            errors.push('HMAC-SHA256 signature verification failed. The manifest may have been tampered with.');
          }
        } else {
          errors.push('Signature verification service unavailable.');
          signatureValid = null;
        }
      } catch (fetchErr: any) {
        errors.push(`Signature verification request failed: ${fetchErr.message}`);
        signatureValid = null;
      }
    } else {
      // Unsigned manifest
      signatureValid = null;
      if (!manifest.signed) {
        errors.push('Manifest is unsigned. Cryptographic authenticity cannot be verified.');
      }
    }

    const allFilesValid = fileResults.every(f => f.valid);
    const integrityValid = allFilesValid && manifestHashValid && duplicates.length === 0;

    let status: 'authentic' | 'integrity-only' | 'failed' = 'failed';
    if (integrityValid) {
      if (signatureValid === true) {
        status = 'authentic';
      } else if (signatureValid === null) {
        status = 'integrity-only';
      }
    }

    const success = status === 'authentic';

    return {
      success,
      integrityValid,
      status,
      fileIntegrity: fileResults,
      manifestHashValid,
      signatureValid,
      manifest,
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      integrityValid: false,
      status: 'failed',
      fileIntegrity: fileResults,
      manifestHashValid: false,
      signatureValid: null,
      manifest,
      errors: [`Verification failed: ${err.message}`],
    };
  }
}
