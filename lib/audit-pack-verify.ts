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

/** SHA-256 hash of a string using Web Crypto API. */
async function sha256(content: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface FileVerifyResult {
  path: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
  found: boolean;
  /**
   * False for a file the manifest lists as user-attested: its name is bound
   * into the signature, its contents are not, and `valid` only says it was
   * there. Absent (true) for every signed file.
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

    // A user-attested file is listed by name only. Its presence is part of
    // what was sealed — the name is in the canonical manifest — so a missing
    // one is an altered archive; its contents are the account holder's own
    // statement and are reported as exactly that, never as verified.
    for (const a of attested) {
      const present = !!zip.file(a.path);
      fileResults.push({ path: a.path, expectedHash: '', actualHash: '', valid: present, found: present, signed: false });
      if (!present) errors.push(`Attested file missing from ZIP: ${a.path}`);
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

      const content = await file.async('text');
      const actualHash = await sha256(content);
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
    const canonicalManifest = canonicalAuditManifest({
      files: manifest.files,
      attested,
      projectId: manifest.projectId,
      runId: manifest.runId,
      runHash: manifest.runHash,
      engineVersion: manifest.engineVersion,
      sapApiCatalogVersion: manifest.sapApiCatalogVersion,
    });
    const computedManifestHash = await sha256(canonicalManifest);
    manifestHashValid = computedManifestHash === manifest.manifestHash;

    if (!manifestHashValid) {
      errors.push(`Manifest hash mismatch: expected ${manifest.manifestHash.substring(0, 16)}..., got ${computedManifestHash.substring(0, 16)}...`);
    }

    // 5. Verify HMAC signature via server
    if (manifest.signed && manifest.signature) {
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
    const integrityValid = allFilesValid && manifestHashValid;

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
