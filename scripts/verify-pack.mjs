#!/usr/bin/env node
/**
 * Offline verifier for a Clean-Core.io audit pack.
 *
 * The site said "anyone can verify" while every signature was HMAC-SHA256
 * against a shared secret — which means the only party who could check a pack
 * was the one that issued it, and anyone able to check could also forge. This
 * script is the other half of fixing that: it needs no account, no secret and no
 * network call to us beyond fetching a public key, and it re-derives every
 * number in the manifest from the files in the ZIP rather than trusting them.
 *
 * Usage:
 *   node scripts/verify-pack.mjs <pack.zip> [--key <base64|path|url>]
 *
 * With no --key it fetches https://clean-core.io/.well-known/clean-core-io-signing.json
 * — always that address, never one the pack names. Point --key at a file or a
 * base64 string to check against a key you already hold.
 *
 * Exit codes: 0 verified · 1 verification failed · 2 could not run the check.
 * The third is deliberately distinct — "I could not tell" is not "it is forged".
 * A pack without an Ed25519 signature exits 2, not 0: its checksums can be
 * consistent with themselves and still say nothing about who issued it.
 */

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const OK = 0;
const FAILED = 1;
const CANNOT_CHECK = 2;

const TRUSTED_KEY_URL = 'https://clean-core.io/.well-known/clean-core-io-signing.json';

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
};

function usage(message) {
  if (message) console.error(c.bad(message) + '\n');
  console.error('Usage: node scripts/verify-pack.mjs <pack.zip> [--key <base64|path|url>]');
  process.exit(CANNOT_CHECK);
}

const args = process.argv.slice(2);
const packPath = args.find((a) => !a.startsWith('--'));
const keyIndex = args.indexOf('--key');
const keyArg = keyIndex >= 0 ? args[keyIndex + 1] : undefined;
if (!packPath) usage('No pack given.');

/** Rebuild the DER SPKI wrapper around the raw 32 bytes of an Ed25519 key. */
function publicKeyFromRawBase64(b64) {
  const raw = Buffer.from(b64, 'base64');
  if (raw.length !== 32) throw new Error(`expected 32 key bytes, got ${raw.length}`);
  return createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * The key's id, derived from the key rather than read from whoever handed it
 * over — the same derivation the issuer uses.
 *
 * Derived here for every source, because a key passed as `--key <base64>` or a
 * PEM file arrives without a stated id, and the earlier version then compared
 * the pack's id against the string "(from argument)" and warned on a perfectly
 * good verification. A warning that fires on success is a warning people learn
 * to skip.
 */
function keyIdOf(publicKey) {
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return createHash('sha256').update(der.subarray(der.length - 32)).digest('hex').slice(0, 16);
}

async function resolveKey(manifest) {
  // Which key the pack says signed it. Held only to the shape the issuer
  // derives, so a pack cannot steer the selection with anything else.
  const wanted = /^[0-9a-f]{16}$/.test(String(manifest.signingKeyId || '')) ? String(manifest.signingKeyId) : null;

  if (keyArg) {
    if (/^https?:\/\//.test(keyArg)) return fetchKey(keyArg, wanted);
    // A path if it reads as a file, otherwise treat the argument as the key.
    try {
      const text = await readFile(keyArg, 'utf8');
      const parsed = text.trim().startsWith('{') ? JSON.parse(text) : null;
      if (parsed) return keyFromDocument(parsed, wanted);
      const key = text.includes('BEGIN')
        ? createPublicKey(text)
        : publicKeyFromRawBase64(text.trim());
      return { key, keyId: keyIdOf(key) };
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e;
      const key = publicKeyFromRawBase64(keyArg);
      return { key, keyId: keyIdOf(key) };
    }
  }
  // The pack does not get a say in where its own trust root lives. This used
  // to honour `manifest.signingKeyUrl` first, so a pack signed with any key at
  // all could name the document that would confirm it, the verifier fetched
  // that document from wherever it pointed, and reported success — offline
  // verification of the forger's own key. The key comes from the fixed origin
  // or from --key. A pack that names another address is noted, not followed.
  if (manifest.signingKeyUrl && manifest.signingKeyUrl !== TRUSTED_KEY_URL) {
    // Quoted and stripped of control characters: the value is the pack's, and
    // a pack that can name its own key document can also put a terminal escape
    // or a newline in the name and write "Verified." on the line below.
    const shown = JSON.stringify(String(manifest.signingKeyUrl).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200));
    console.log(c.warn(`WARNING   pack names ${shown} as its key document — ignored`));
  }
  return fetchKey(TRUSTED_KEY_URL, wanted);
}

async function fetchKey(url, wanted) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetching ${url} returned HTTP ${res.status}`);
  return keyFromDocument(await res.json(), wanted);
}

/**
 * The key the pack names, out of everything the document publishes.
 *
 * It used to take the first Ed25519 entry and nothing else, which was the same
 * as assuming the document only ever holds one key. The day the issuer rotates,
 * every pack signed before it is checked against the *new* key and reported as
 * not verifying — a genuine pack, given the answer reserved for a forged one.
 * So: match on the pack's `signingKeyId`, against the id **derived** from each
 * published key rather than the label beside it, and fall back to the active
 * entry only for a pack that names no key at all (the shape packs had before
 * the id existed).
 *
 * A pack that names a key the document does not publish is not verified and not
 * refused either — it throws, and the caller exits `CANNOT_CHECK`. That is the
 * honest verdict: the key may have been revoked, or the auditor may be pointing
 * at the wrong document, and neither is a statement about the signature.
 */
function keyFromDocument(doc, wanted) {
  const entries = (doc.keys || []).filter((k) => k && (k.publicKeyPem || k.publicKey));
  if (entries.length === 0) throw new Error('the key document contains no keys');

  const usable = [];
  for (const entry of entries) {
    try {
      const key = entry.publicKeyPem
        ? createPublicKey(entry.publicKeyPem)
        : publicKeyFromRawBase64(entry.publicKey);
      // The id is derived from the key, not taken from the document: a document
      // that mislabels its own key would otherwise pass the id check it exists
      // to fail.
      usable.push({ key, keyId: keyIdOf(key), status: entry.status });
    } catch {
      /* an unreadable entry is not a reason to abandon the readable ones */
    }
  }
  if (usable.length === 0) throw new Error('the key document contains no usable Ed25519 key');

  if (wanted) {
    const match = usable.find((u) => u.keyId === wanted);
    if (match) return { key: match.key, keyId: match.keyId };
    throw new Error(
      `the pack was signed with key ${wanted}, which this key document does not publish ` +
        `(it publishes ${usable.map((u) => u.keyId).join(', ')}). The key may have been withdrawn.`,
    );
  }

  const active = usable.find((u) => u.status === 'active') || usable[0];
  return { key: active.key, keyId: active.keyId };
}

/** The characters the canonical form uses as separators; `lib/audit-pack-canonical.ts` says why no path may contain one. */
const SEPARATOR = /[:;,]/;
/** The run-binding fields are held only to this: the live catalog version carries a colon and a comma. */
const SECTION_END = /;/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Format 3 escapes the run-binding fields; format 2 is left at the bytes it was signed with. */
function escapeField(value) {
  return String(value).replace(/%/g, '%25').replace(/:/g, '%3A').replace(/;/g, '%3B');
}

/** True for a manifest sealed in the bound form — attested digests and issuance metadata. */
function bindsIssuanceMetadata(version) {
  const major = Number.parseInt(String(version ?? ''), 10);
  return Number.isFinite(major) && major >= 3;
}

/** True for a manifest whose signature binds the handover chain (roadmap 8.5, format 4). */
function bindsCoverage(version) {
  const major = Number.parseInt(String(version ?? ''), 10);
  return Number.isFinite(major) && major >= 4;
}

/** The four links and the three coverage values — the same lists as `lib/evidence-chain.ts`. */
const CHAIN_STEPS = ['requirement', 'decision', 'receipt', 'delivery'];
const CHAIN_STEP_LABELS = {
  requirement: 'Requirement',
  decision: 'Decision',
  receipt: 'Receipt',
  delivery: 'Delivery artefact',
};
const COVERAGE_KINDS = ['signed', 'attested', 'not-determined'];

/**
 * Why this covers[] cannot be read as a statement about this manifest, or null —
 * the same rules as `coversDefect` in `lib/audit-pack-canonical.ts`.
 *
 * The rows are bound into the signed string, so a forged covers[] fails the
 * digest anyway. These rules catch the other half: a genuine signature over a
 * covers[] that says something the manifest it sits in does not support — a
 * link claiming the signature covers a file listed only under `attested`, or a
 * chain with a link missing so that what is left reads complete.
 */
function coversDefect(manifest, attested) {
  const covers = manifest.covers;
  if (!Array.isArray(covers)) return 'a manifest of this version must name the handover chain in covers[]';
  const signedPaths = new Set((manifest.files || []).map((f) => f.path));
  const attestedPaths = new Set(attested.map((a) => a.path));
  const seen = new Set();
  for (const c of covers) {
    const step = String((c && c.step) ?? '');
    const coverage = String((c && c.coverage) ?? '');
    const ref = typeof (c && c.ref) === 'string' ? c.ref : '';
    if (!CHAIN_STEPS.includes(step)) return `covers names a link that is not part of the chain: ${JSON.stringify(step)}`;
    if (!COVERAGE_KINDS.includes(coverage)) return `the chain link ${JSON.stringify(step)} carries an unknown coverage: ${JSON.stringify(coverage)}`;
    if (seen.has(step)) return `the chain link ${JSON.stringify(step)} is listed twice`;
    seen.add(step);
    if (SEPARATOR.test(ref)) return `the chain link ${JSON.stringify(step)} names a file whose path contains a field separator: ${JSON.stringify(ref)}`;
    if (coverage === 'signed' && !signedPaths.has(ref)) {
      return `the chain link ${JSON.stringify(step)} claims the signature covers ${JSON.stringify(ref)}, which this manifest does not list under files`;
    }
    if (coverage === 'attested' && !attestedPaths.has(ref)) {
      return `the chain link ${JSON.stringify(step)} points at ${JSON.stringify(ref)} as a user-attested file, which this manifest does not list under attested`;
    }
    if (coverage === 'not-determined' && ref !== '') {
      return `the chain link ${JSON.stringify(step)} is not determined and still names a file: ${JSON.stringify(ref)}`;
    }
  }
  const missing = CHAIN_STEPS.filter((step) => !seen.has(step));
  if (missing.length > 0) return `covers does not account for every link of the chain; missing: ${missing.join(', ')}`;
  return null;
}

/**
 * Names the archive's central directory lists more than once — the same check as
 * `duplicateEntryNames` in `lib/audit-pack-verify.ts`, repeated here for the same
 * reason the canonical form is: this script needs no build.
 *
 * JSZip holds a loaded archive in a map keyed by name, so two entries under one
 * name arrive as one and the loop above hashes whichever of them survived. An
 * archive can then carry a second entry under a signed path while every listed
 * hash, the manifest hash and the signature agree, and an extractor that takes
 * the first entry hands the reader the other one. The manifest names each path
 * once; an archive that lists one twice is not the archive that was sealed.
 *
 * An archive this cannot count — no end record, a ZIP64 marker, a record that is
 * not where the previous one said it ends — returns nothing rather than a guess.
 * The other checks still apply, and a genuine pack must not fail over a shape
 * this simply did not parse.
 */
/**
 * An entry name as JSZip will key it — the same resolution as `zipKey` in
 * `lib/audit-pack-verify.ts`, repeated here because this script needs no build.
 * JSZip resolves `.` and `..` before keying its map, so two central-directory
 * names that differ only by an alias are one entry to it and were two to this
 * check (QA review of fce34641821e).
 */
function zipKey(name) {
  const rooted = name.startsWith('/');
  const out = [];
  for (const part of name.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  const body = out.join('/') + (name.endsWith('/') && out.length ? '/' : '');
  return rooted ? `/${body}` : body || '/';
}

function duplicateEntryNames(buffer) {
  const unchecked = (why) => ({ duplicates: [], counted: false, why });
  const b = Buffer.from(buffer);
  if (b.length < 22) return unchecked('the archive is too short to hold a ZIP end record');
  const floor = Math.max(0, b.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = b.length - 22; i >= floor; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return unchecked('no ZIP end-of-central-directory record was found');
  const total = b.readUInt16LE(eocd + 10);
  let offset = b.readUInt32LE(eocd + 16);
  if (total === 0xffff || offset === 0xffffffff) return unchecked('the archive uses the ZIP64 format, which this check does not read');

  const seen = new Set();
  const duplicates = new Set();
  // Walked until the records run out, not until the declared count is reached:
  // an archive may declare two entries and write three, and a loop that trusts
  // the number stops before the duplicate and still reports "counted"
  // (QA review of b378e515ae25). Same rule as `lib/audit-pack-verify.ts`.
  let walked = 0;
  while (offset + 46 <= b.length && b.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = b.readUInt16LE(offset + 28);
    const extraLength = b.readUInt16LE(offset + 30);
    const commentLength = b.readUInt16LE(offset + 32);
    if (offset + 46 + nameLength > b.length) {
      return unchecked('a central-directory record names a file beyond the end of the archive');
    }
    const name = zipKey(b.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
    offset += 46 + nameLength + extraLength + commentLength;
    walked += 1;
    if (walked > 100000) return unchecked('the central directory holds more records than any pack this platform issues');
  }
  if (walked !== total) {
    return unchecked(`the end record declares ${total} entries and the central directory holds ${walked}`);
  }
  return { duplicates: [...duplicates].sort(), counted: true };
}

/** Why this manifest has no single canonical string, or null — the same rules as `canonicalManifestDefect`. */
function canonicalDefect(manifest, attested) {
  const bound = bindsIssuanceMetadata(manifest.version);
  const seen = new Set();
  for (const f of manifest.files || []) {
    if (!f.path) return 'a file entry has no path';
    if (SEPARATOR.test(f.path)) return `a file path contains a field separator: ${JSON.stringify(f.path)}`;
    if (!SHA256.test(f.sha256)) return `${JSON.stringify(f.path)} carries no 64-digit lowercase SHA-256`;
    if (seen.has(f.path)) return `the same path is listed twice: ${JSON.stringify(f.path)}`;
    seen.add(f.path);
  }
  for (const a of attested) {
    if (!a.path) return 'an attested entry has no path';
    if (SEPARATOR.test(a.path)) return `an attested path contains a field separator: ${JSON.stringify(a.path)}`;
    if (seen.has(a.path)) return `${JSON.stringify(a.path)} is listed as both signed and attested`;
    seen.add(a.path);
    if (bound) {
      if (!SHA256.test(a.sha256 ?? '')) return `the attested file ${JSON.stringify(a.path)} carries no 64-digit lowercase SHA-256`;
    } else if (a.sha256 !== undefined) {
      return `the attested file ${JSON.stringify(a.path)} carries a digest that manifest version ${JSON.stringify(String(manifest.version ?? ''))} does not bind`;
    }
  }
  if (!bound) {
    for (const name of ['projectId', 'runId', 'runHash', 'engineVersion', 'sapApiCatalogVersion']) {
      const value = manifest[name];
      if (value !== undefined && SECTION_END.test(String(value))) return `${name} contains a field separator: ${JSON.stringify(value)}`;
    }
  }
  if (bound) {
    if (SEPARATOR.test(String(manifest.version))) return `version contains a field separator: ${JSON.stringify(manifest.version)}`;
    if (!ISO_INSTANT.test(String(manifest.generatedAt ?? ''))) return `generatedAt is not an ISO-8601 instant: ${JSON.stringify(String(manifest.generatedAt ?? ''))}`;
  }
  if (bindsCoverage(manifest.version)) {
    const defect = coversDefect(manifest, attested);
    if (defect) return defect;
  } else if (manifest.covers !== undefined) {
    return `covers[] is present but manifest version ${JSON.stringify(String(manifest.version ?? ''))} does not bind it`;
  }
  return null;
}

async function main() {
  let JSZip;
  try {
    JSZip = require('jszip');
  } catch {
    console.error(c.bad('jszip is not installed. Run this from a checkout with dependencies, or `npm i jszip`.'));
    process.exit(CANNOT_CHECK);
  }

  const packBytes = await readFile(packPath);
  const zip = await JSZip.loadAsync(packBytes);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    console.error(c.bad('No manifest.json in the pack — nothing to verify.'));
    process.exit(CANNOT_CHECK);
  }
  const manifest = JSON.parse(await manifestFile.async('string'));

  console.log(`\nPack      ${packPath}`);
  console.log(`Run       ${manifest.runId}  ${c.dim(`project ${manifest.projectId}`)}`);
  console.log(`Issued    ${manifest.generatedAt}  ${c.dim(`engine ${manifest.engineVersion}`)}`);
  console.log('');

  // 1. Every file in the manifest, hashed again from the ZIP. A signature over a
  //    manifest says nothing if the manifest does not describe the contents.
  let contentsOk = true;
  for (const f of manifest.files || []) {
    const entry = zip.file(f.path);
    if (!entry) {
      console.log(`${c.bad('missing')}   ${f.path}`);
      contentsOk = false;
      continue;
    }
    const actual = createHash('sha256').update(await entry.async('nodebuffer')).digest('hex');
    if (actual !== f.sha256) {
      console.log(`${c.bad('altered')}   ${f.path}`);
      contentsOk = false;
    }
  }
  // The manifest can only vouch for what it lists. A file dropped in next to
  // the evidence leaves every listed hash, the manifest hash and the signature
  // exactly as they were, so a pack that passed the loop above could still
  // carry a page nobody signed. The archive has to match the manifest, entry
  // for entry.
  const attested = Array.isArray(manifest.attested) ? manifest.attested : [];
  const listed = new Set([...(manifest.files || []).map((f) => f.path), ...attested.map((a) => a.path)]);
  const unlisted = Object.values(zip.files)
    .filter((e) => !e.dir && e.name !== 'manifest.json' && !listed.has(e.name))
    .map((e) => e.name)
    .sort();
  for (const name of unlisted) {
    console.log(`${c.bad('unlisted')}  ${name}`);
    contentsOk = false;
  }
  // The same rule, asked of the raw archive rather than of the map JSZip built
  // from it: a path the archive carries twice is an entry the manifest does not
  // account for, and only one of the two can be the file it names.
  const entryNames = duplicateEntryNames(packBytes);
  for (const name of entryNames.duplicates) {
    console.log(`${c.bad('twice')}     ${name}  ${c.dim('the archive lists this path more than once')}`);
    contentsOk = false;
  }
  if (!entryNames.counted) {
    // Not "no duplicates" — "not checked". JSZip loads such an archive, folds
    // any duplicate into one map entry, and leaves every hash agreeing, so a
    // silent pass here was a way through (QA review of 9d7721972a67).
    console.log(`${c.bad('unread')}    ${c.dim(`the archive's entry list could not be read, so duplicate paths were not checked: ${entryNames.why}`)}`);
    contentsOk = false;
  }
  // A user-attested file carries the account holder's own statement. From
  // manifest version 3 the issuer records its SHA-256 and binds it into the
  // signature — which self-declaration was sealed is a fact about the archive,
  // and while it was unbound anyone holding a genuine pack could rewrite
  // "sign-off: not given" into a fabricated approval and still read "Verified"
  // here. A version-2 pack has no digest to check, and that gap is printed
  // rather than folded into the verdict.
  let unboundAttested = 0;
  for (const a of attested) {
    const entry = zip.file(a.path);
    if (!entry) {
      console.log(`${c.bad('missing')}   ${a.path}  ${c.dim('attested file the manifest names')}`);
      contentsOk = false;
    } else if (!a.sha256) {
      unboundAttested += 1;
      console.log(`${c.warn('attested')}  ${a.path}  ${c.dim("user-attested — present; in this pack's format its contents are not covered by the signature")}`);
    } else if (createHash('sha256').update(await entry.async('nodebuffer')).digest('hex') !== a.sha256) {
      console.log(`${c.bad('altered')}   ${a.path}  ${c.dim('attested file — its bytes are not the bytes that were sealed')}`);
      contentsOk = false;
    } else {
      console.log(`${c.warn('attested')}  ${a.path}  ${c.dim("user-attested — the sealed bytes, the account holder's own statement")}`);
    }
  }
  console.log(
    contentsOk
      ? `${c.ok('OK')}        ${(manifest.files || []).length} files match their recorded hashes, nothing else in the archive${attested.length ? ` beyond ${attested.length} attested file(s)` : ''}`
      : c.bad('FAILED    the pack contents do not match the manifest'),
  );

  // 2. The manifest hash, rebuilt the way the issuer built it
  //    (lib/audit-pack-canonical.ts — this script repeats the form so it needs
  //    no build; tests/verify-pack-cli.spec.ts holds the two to the same bytes).
  // The form is only canonical if one string can come from one manifest. A
  // concatenation with unescaped separators is not: delete file `a`, rename `b`
  // to `a:<hash of a>;b`, collapse the two rows into that one, and the signed
  // bytes are unchanged while a signed evidence file is gone. So a separator in
  // a path, a digest that is not 64 lowercase hex digits, or a repeated path is
  // a manifest no issuer wrote — refused here, on old and new packs alike.
  const defect = canonicalDefect(manifest, attested);
  if (defect) {
    console.log(c.bad(`FAILED    this manifest has no unambiguous canonical form: ${defect}`));
    console.log('\n' + c.bad('NOT verified. At least one check above failed.') + '\n');
    process.exit(FAILED);
  }

  const bound = bindsIssuanceMetadata(manifest.version);
  const sorted = [...(manifest.files || [])].sort((a, b) => a.path.localeCompare(b.path));
  const attestedSorted = [...attested].sort((a, b) => a.path.localeCompare(b.path));
  // The run suffix belongs only to a pack that carries a run hash. Appending
  // it unconditionally turned every pack issued before the run binding into
  // "FAILED manifest digest" here while the web verifier said OK — two
  // verifiers, two answers, for the same file (QA review of ca3264f05f39).
  const canonical =
    sorted.map((f) => `${f.path}:${f.sha256}`).join(';') +
    ';' +
    (manifest.runHash !== undefined
      ? ((f) =>
          `${f(manifest.projectId || '')}:${f(manifest.runId || '')}:${f(manifest.runHash || '')}:${f(manifest.engineVersion || '')}:${f(manifest.sapApiCatalogVersion || '')};`)(
          bound ? escapeField : (s) => String(s),
        )
      : '') +
    (attestedSorted.length
      ? `attested=${attestedSorted.map((a) => (bound ? `${a.path}:${a.sha256}` : a.path)).join(',')};`
      : '') +
    (bound ? `issued=${manifest.version}:${manifest.generatedAt};` : '') +
    (bindsCoverage(manifest.version)
      ? `covers=${[...(manifest.covers || [])]
          .sort((a, b) => String(a.step).localeCompare(String(b.step)))
          .map((x) => `${x.step}:${x.coverage}:${x.ref}`)
          .join(',')};`
      : '');
  const manifestHash = createHash('sha256').update(canonical).digest('hex');
  const hashOk = manifestHash === manifest.manifestHash;
  console.log(
    hashOk
      ? `${c.ok('OK')}        manifest digest ${manifestHash.slice(0, 16)}…`
      : c.bad(`FAILED    manifest digest is ${manifestHash.slice(0, 16)}… but the pack claims ${String(manifest.manifestHash).slice(0, 16)}…`),
  );

  // 2b. The handover chain, once the digest above has established that these
  //     rows are the ones that were sealed (roadmap 8.5). Printed link by link,
  //     because the one thing a reader must not take away from a green line is
  //     that the signature stands behind all four of them. A link the pack
  //     cannot fill prints its own state, and the archive carries the reason.
  let openLinks = 0;
  if (bindsCoverage(manifest.version) && Array.isArray(manifest.covers)) {
    const byStep = new Map(manifest.covers.map((x) => [String(x.step), x]));
    console.log(`${c.dim('chain')}     Requirement -> Decision -> Receipt -> Delivery artefact`);
    for (const step of CHAIN_STEPS) {
      const row = byStep.get(step);
      const coverage = String((row && row.coverage) ?? 'not-determined');
      const ref = String((row && row.ref) ?? '');
      if (coverage !== 'signed') openLinks += 1;
      const mark = coverage === 'signed' ? c.ok('signed  ') : c.warn(coverage.padEnd(8));
      console.log(
        `  ${mark}  ${CHAIN_STEP_LABELS[step].padEnd(18)}${
          ref ? c.dim(ref) : c.dim('no record in this pack - see 09-evidence-chain.json')
        }`,
      );
    }
  }

  // 3. The signature.
  if (!manifest.signatureEd25519) {
    console.log(
      `${c.warn('SKIPPED')}   this pack carries only the HMAC signature, which cannot be checked ` +
        `without the\n          issuer's secret. Ask the issuing instance: POST /api/export/verify.`,
    );
    console.log(
      c.dim('\n          Packs issued after the Ed25519 key was configured carry a signature\n          this script can check on its own.'),
    );
    // Consistent checksums are a fact about the archive, not about its origin:
    // anyone can assemble files, hash them and write the hashes down. Exit 0 is
    // documented as "verified", and this is not that.
    process.exit(contentsOk && hashOk ? CANNOT_CHECK : FAILED);
  }

  let key, keyId;
  try {
    ({ key, keyId } = await resolveKey(manifest));
  } catch (e) {
    console.error(c.bad(`\nCould not obtain a public key: ${e.message}`));
    console.error(c.dim('This is not a statement about the signature.'));
    process.exit(CANNOT_CHECK);
  }

  const sigOk = cryptoVerify(
    null,
    Buffer.from(manifestHash, 'utf8'),
    key,
    Buffer.from(manifest.signatureEd25519, 'base64'),
  );
  console.log(
    sigOk
      ? `${c.ok('OK')}        Ed25519 signature valid  ${c.dim(`key ${keyId}`)}`
      : c.bad(`FAILED    Ed25519 signature does not verify against key ${keyId}`),
  );

  if (manifest.signingKeyId && keyId && manifest.signingKeyId !== keyId) {
    console.log(
      c.warn(`WARNING   pack names key ${manifest.signingKeyId}, verified against ${keyId}`),
    );
  }

  const verified = contentsOk && hashOk && sigOk;
  // Two sentences, not one: a pack can be entirely genuine and still stand
  // behind one link of four. Folding that into "Verified." is the comfortable
  // version roadmap 8.5 was written against.
  const chainNote = openLinks
    ? `\n${openLinks} of ${CHAIN_STEPS.length} links of the handover chain are not covered by this signature; 09-evidence-chain.json says why for each.`
    : '';
  // A pack sealed before attested contents were bound gets a verdict that names
  // the exception instead of one sentence that covers the whole archive: the
  // signed evidence is verified, the self-declaration inside it is not.
  console.log(
    '\n' +
      (verified
        ? unboundAttested
          ? c.ok('Verified. The signed evidence, the manifest and the signature all agree — checked offline, no secret involved.') +
            c.warn(
              `\n${unboundAttested} attested file(s) carry no digest in this pack's manifest version, so their contents are outside the check.`,
            ) +
            c.warn(chainNote)
          : c.ok('Verified. Contents, manifest and signature all agree — checked offline, no secret involved.') +
            c.warn(chainNote)
        : c.bad('NOT verified. At least one check above failed.')) +
      '\n',
  );
  process.exit(verified ? OK : FAILED);
}

main().catch((e) => {
  console.error(c.bad(`\nCould not complete the check: ${e.message}`));
  console.error(c.dim('Exit 2 means the check did not run, not that the pack is bad.'));
  process.exit(CANNOT_CHECK);
});
