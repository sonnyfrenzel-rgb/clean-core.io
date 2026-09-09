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
 * With no --key it fetches https://clean-core.io/.well-known/clean-core-io-signing.json,
 * or the URL the manifest names in `signingKeyUrl`. Point --key at a file or a
 * base64 string to check against a key you already hold.
 *
 * Exit codes: 0 verified · 1 verification failed · 2 could not run the check.
 * The third is deliberately distinct — "I could not tell" is not "it is forged".
 */

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const OK = 0;
const FAILED = 1;
const CANNOT_CHECK = 2;

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
  if (keyArg) {
    if (/^https?:\/\//.test(keyArg)) return fetchKey(keyArg);
    // A path if it reads as a file, otherwise treat the argument as the key.
    try {
      const text = await readFile(keyArg, 'utf8');
      const parsed = text.trim().startsWith('{') ? JSON.parse(text) : null;
      if (parsed) return keyFromDocument(parsed);
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
  const url =
    manifest.signingKeyUrl || 'https://clean-core.io/.well-known/clean-core-io-signing.json';
  return fetchKey(url);
}

async function fetchKey(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetching ${url} returned HTTP ${res.status}`);
  return keyFromDocument(await res.json());
}

function keyFromDocument(doc) {
  const entry = (doc.keys || []).find((k) => k.algorithm === 'Ed25519') || (doc.keys || [])[0];
  if (!entry) throw new Error('the key document contains no keys');
  const key = entry.publicKeyPem
    ? createPublicKey(entry.publicKeyPem)
    : publicKeyFromRawBase64(entry.publicKey);
  // The id is derived from the key, not taken from the document: a document that
  // mislabels its own key would otherwise pass the id check it exists to fail.
  return { key, keyId: keyIdOf(key) };
}

async function main() {
  let JSZip;
  try {
    JSZip = require('jszip');
  } catch {
    console.error(c.bad('jszip is not installed. Run this from a checkout with dependencies, or `npm i jszip`.'));
    process.exit(CANNOT_CHECK);
  }

  const zip = await JSZip.loadAsync(await readFile(packPath));
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
  console.log(
    contentsOk
      ? `${c.ok('OK')}        ${(manifest.files || []).length} files match their recorded hashes`
      : c.bad('FAILED    the pack contents do not match the manifest'),
  );

  // 2. The manifest hash, rebuilt the way the issuer built it.
  const sorted = [...(manifest.files || [])].sort((a, b) => a.path.localeCompare(b.path));
  const canonical =
    sorted.map((f) => `${f.path}:${f.sha256}`).join(';') +
    ';' +
    `${manifest.projectId}:${manifest.runId}:${manifest.runHash}:${manifest.engineVersion}:${manifest.sapApiCatalogVersion || ''};`;
  const manifestHash = createHash('sha256').update(canonical).digest('hex');
  const hashOk = manifestHash === manifest.manifestHash;
  console.log(
    hashOk
      ? `${c.ok('OK')}        manifest digest ${manifestHash.slice(0, 16)}…`
      : c.bad(`FAILED    manifest digest is ${manifestHash.slice(0, 16)}… but the pack claims ${String(manifest.manifestHash).slice(0, 16)}…`),
  );

  // 3. The signature.
  if (!manifest.signatureEd25519) {
    console.log(
      `${c.warn('SKIPPED')}   this pack carries only the HMAC signature, which cannot be checked ` +
        `without the\n          issuer's secret. Ask the issuing instance: POST /api/export/verify.`,
    );
    console.log(
      c.dim('\n          Packs issued after the Ed25519 key was configured carry a signature\n          this script can check on its own.'),
    );
    process.exit(contentsOk && hashOk ? OK : FAILED);
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
  console.log(
    '\n' +
      (verified
        ? c.ok('Verified. Contents, manifest and signature all agree — checked offline, no secret involved.')
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
