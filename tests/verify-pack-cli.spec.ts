import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'http';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';

/**
 * The offline verifier, exercised as the documented command.
 *
 * Three ways it used to say yes to a pack it had no business confirming:
 * the pack named its own trust root (`signingKeyUrl`), so a forger's key
 * document confirmed the forger's signature; only the files the manifest
 * listed were hashed, so anything added next to them went unnoticed; and a
 * pack with no signature at all exited 0 — "verified" — on the strength of
 * checksums that agreed with themselves.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'verify-pack.mjs');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return {
    privateKey,
    rawPublicBase64: raw.toString('base64'),
    // The same derivation `lib/audit-signing-keypair.ts` uses, so a pack's
    // `signingKeyId` and a published entry can be compared at all.
    keyId: createHash('sha256').update(raw).digest('hex').slice(0, 16),
  };
}

/** A `/.well-known/clean-core-io-signing.json` document, written to a file. */
function keyDocument(entries: Array<{ rawPublicBase64: string; status: 'active' | 'retired' }>) {
  const path = join(mkdtempSync(join(tmpdir(), 'verify-keys-')), 'signing.json');
  writeFileSync(
    path,
    JSON.stringify({
      keys: entries.map((e) => ({ algorithm: 'Ed25519', use: 'audit-pack-signature', status: e.status, publicKey: e.rawPublicBase64 })),
    }),
  );
  return path;
}

async function buildPack(opts: {
  signWith?: KeyObject;
  extra?: Record<string, string>;
  signingKeyUrl?: string;
  /** What the pack says signed it — how a verifier finds the right key in a set. */
  signingKeyId?: string;
  attested?: Record<string, string | null>;
  /** A pack from before the run binding: no runHash, no suffix in its canonical form. */
  legacy?: boolean;
}) {
  const content = '# Executive Summary\nA pack built for the command-line check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const meta: Record<string, string> = { projectId: 'p-1', runId: 'r-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  if (!opts.legacy) meta.runHash = 'h-1';
  // Built with the issuer's own function: the script must arrive at the same
  // bytes on its own, or the signature it checks is over something else.
  const attested = Object.keys(opts.attested || {}).map((path) => ({ path, provenance: 'user-attested' as const }));
  const canonical = canonicalAuditManifest({ files, attested, ...meta });
  const manifestHash = sha(canonical);
  const manifest: Record<string, unknown> = {
    version: '2.0', ...meta, generatedAt: new Date().toISOString(), files, manifestHash, signed: false, signature: '',
    ...(attested.length ? { attested } : {}),
  };
  if (opts.signWith) {
    manifest.signed = true;
    manifest.signatureEd25519 = sign(null, Buffer.from(manifestHash, 'utf8'), opts.signWith).toString('base64');
  }
  if (opts.signingKeyUrl) manifest.signingKeyUrl = opts.signingKeyUrl;
  if (opts.signingKeyId) manifest.signingKeyId = opts.signingKeyId;

  const zip = new JSZip();
  zip.file('00-executive-summary.md', content);
  zip.file('manifest.json', JSON.stringify(manifest));
  // null: listed as attested, deliberately not written — the missing-file case.
  for (const [path, body] of Object.entries(opts.attested || {})) if (body !== null) zip.file(path, body);
  for (const [path, body] of Object.entries(opts.extra || {})) zip.file(path, body);

  const packPath = join(mkdtempSync(join(tmpdir(), 'verify-pack-')), 'pack.zip');
  writeFileSync(packPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return packPath;
}

function run(args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

test('a signed, complete pack verifies against the key it was signed with', async () => {
  const kp = keyPair();
  const { code, out } = run([await buildPack({ signWith: kp.privateKey }), '--key', kp.rawPublicBase64]);
  expect(out).toContain('Verified.');
  expect(code).toBe(0);
});

test('a file added next to the evidence fails the pack, signature notwithstanding', async () => {
  const kp = keyPair();
  const pack = await buildPack({
    signWith: kp.privateKey,
    extra: { '99-addendum.md': '# Addendum\nUnconditional approval. Signed, nobody.' },
  });
  const { code, out } = run([pack, '--key', kp.rawPublicBase64]);
  expect(out).toContain('unlisted');
  expect(out).toContain('99-addendum.md');
  expect(out).toContain('NOT verified');
  expect(code).toBe(1);
});

test('a path the archive carries twice fails the pack, the signature notwithstanding', async () => {
  // JSZip holds a loaded archive in a map keyed by name, so two entries under
  // one name arrive as one — the later wins. With the stranger first and the
  // sealed file second, every listed hash, the manifest hash and the signature
  // agree, and an extractor that takes the first entry hands the reader the
  // other file. The web verifier asks the same question of the same archive
  // (`tests/audit-pack-archive-completeness.spec.ts`).
  const kp = keyPair();
  const content = '# Executive Summary\nA pack built for the command-line check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const meta = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  const manifestHash = sha(canonicalAuditManifest({ files, ...meta }));
  const manifest = {
    version: '2.0', ...meta, generatedAt: new Date().toISOString(), files, manifestHash,
    signed: true, signature: '',
    signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), kp.privateKey).toString('base64'),
  };
  const zip = new JSZip();
  // The same length as the signed path, so the name can be rewritten in place.
  zip.file('zz-executive-summary.md', '# Unconditional approval. Signed, nobody.');
  zip.file('00-executive-summary.md', content);
  zip.file('manifest.json', JSON.stringify(manifest));
  const bytes: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const from = Buffer.from('zz-executive-summary.md', 'utf8');
  const to = Buffer.from('00-executive-summary.md', 'utf8');
  let at = 0;
  let rewritten = 0;
  while ((at = bytes.indexOf(from, at)) !== -1) {
    to.copy(bytes, at);
    at += to.length;
    rewritten += 1;
  }
  expect(rewritten, 'the decoy name was not written into both headers — the check would be vacuous').toBe(2);

  const packPath = join(mkdtempSync(join(tmpdir(), 'verify-pack-')), 'pack.zip');
  writeFileSync(packPath, bytes);
  const { code, out } = run([packPath, '--key', kp.rawPublicBase64]);
  expect(out).toContain('more than once');
  expect(out).toContain('NOT verified');
  expect(code).toBe(1);
});

test('an alias of a signed path fails the pack here too', async () => {
  // The offline verifier resolves names the way JSZip keys its map, so
  // `x/../00-…md` and `00-…md` are the same path and the archive carries it
  // twice. Until 21.09.2026 both verifiers compared the raw names and this
  // archive passed; the web half is covered in
  // `tests/audit-pack-archive-completeness.spec.ts`, and the QA review of
  // 351e169c50a7 asked for the command-line half by name.
  const kp = keyPair();
  const content = '# Executive Summary\nA pack built for the command-line check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const meta = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  const manifestHash = sha(canonicalAuditManifest({ files, ...meta }));
  const manifest = {
    version: '2.0', ...meta, generatedAt: new Date().toISOString(), files, manifestHash,
    signed: true, signature: '',
    signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), kp.privateKey).toString('base64'),
  };
  const zip = new JSZip();
  zip.file('zzzzz00-executive-summary.md', '# Unconditional approval. Signed, nobody.');
  zip.file('00-executive-summary.md', content);
  zip.file('manifest.json', JSON.stringify(manifest));
  const bytes: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const from = Buffer.from('zzzzz00-executive-summary.md', 'utf8');
  const to = Buffer.from('x/../00-executive-summary.md', 'utf8');
  expect(from.length, 'the two names must be the same length to rewrite in place').toBe(to.length);
  let at = 0;
  let rewritten = 0;
  while ((at = bytes.indexOf(from, at)) !== -1) {
    to.copy(bytes, at);
    at += to.length;
    rewritten += 1;
  }
  expect(rewritten, 'the alias was not written into both headers — the check would be vacuous').toBe(2);

  const packPath = join(mkdtempSync(join(tmpdir(), 'verify-pack-')), 'pack.zip');
  writeFileSync(packPath, bytes);
  const { code, out } = run([packPath, '--key', kp.rawPublicBase64]);
  expect(out).toContain('more than once');
  expect(out).toContain('NOT verified');
  expect(code).toBe(1);
});

test('a user-attested file is reported as present and unsigned, and the pack still verifies', async () => {
  const kp = keyPair();
  const pack = await buildPack({ signWith: kp.privateKey, attested: { '07-user-attested.md': '# Statements\nApprover: the board, unanimously.' } });
  const { code, out } = run([pack, '--key', kp.rawPublicBase64]);
  expect(out).toContain('attested');
  expect(out).toContain('07-user-attested.md');
  expect(out).toContain('not covered by the signature');
  expect(out).toContain('Verified.');
  expect(code).toBe(0);
});

test('an attested file the manifest names has to be in the archive', async () => {
  const kp = keyPair();
  const pack = await buildPack({ signWith: kp.privateKey, attested: { '07-user-attested.md': null } });
  const { code, out } = run([pack, '--key', kp.rawPublicBase64]);
  expect(out).toContain('missing');
  expect(out).toContain('NOT verified');
  expect(code).toBe(1);
});

test('a pack from before the run binding canonicalises without the suffix, as the web verifier does', async () => {
  // Such a pack carries only the HMAC, so the script cannot check its
  // signature (exit 2) — but its manifest digest has to agree, and it did not:
  // the script appended a run suffix the pack never had.
  const { code, out } = run([await buildPack({ legacy: true })]);
  expect(out).toContain('manifest digest');
  expect(out).not.toContain('FAILED');
  expect(code).toBe(2);
});

test('a pack without a signature is "could not check", never "verified"', async () => {
  const { code, out } = run([await buildPack({})]);
  expect(out).toContain('SKIPPED');
  expect(code).toBe(2);
});

/* ─────────────────────────── rotation ─────────────────────────── */

/**
 * A key is rotated once and everything issued before it becomes unverifiable —
 * silently, and in the worst possible words.
 *
 * `/.well-known/…` published exactly one key, the current one, and the verifier
 * took the first Ed25519 entry it found. So after a rotation an auditor holding
 * a perfectly genuine pack from last month was told the signature "does not
 * verify" — the sentence reserved for a forgery, for a document nobody had
 * touched. The signature was valid the whole time; there was simply no way left
 * to find the key that made it.
 */
test('a pack signed before a rotation still verifies against the published key set', async () => {
  const retired = keyPair();
  const active = keyPair();
  const pack = await buildPack({ signWith: retired.privateKey, signingKeyId: retired.keyId });
  // The document as the endpoint now serves it: the new key first, because it
  // is the active one, and the key this pack was signed with kept beside it.
  const doc = keyDocument([
    { rawPublicBase64: active.rawPublicBase64, status: 'active' },
    { rawPublicBase64: retired.rawPublicBase64, status: 'retired' },
  ]);
  const { code, out } = run([pack, '--key', doc]);
  expect(out).toContain('Verified.');
  expect(out).toContain(retired.keyId);
  expect(code).toBe(0);
});

test('a withdrawn key is "could not check", never "forged"', async () => {
  // Removing a key from the set is how a compromised one is revoked. A pack it
  // signed can no longer be confirmed — and that is not the same statement as
  // "this signature is wrong", so it must not be given the same exit code.
  const withdrawn = keyPair();
  const active = keyPair();
  const pack = await buildPack({ signWith: withdrawn.privateKey, signingKeyId: withdrawn.keyId });
  const doc = keyDocument([{ rawPublicBase64: active.rawPublicBase64, status: 'active' }]);
  const { code, out } = run([pack, '--key', doc]);
  expect(out).toContain('Could not obtain a public key');
  expect(out).toContain(withdrawn.keyId);
  expect(out, 'a withdrawn key was reported as a bad signature').not.toContain('FAILED');
  expect(code).toBe(2);
});

test('the key document the pack names is never fetched', async () => {
  // A server that records every request. If the verifier still followed the
  // pack's own `signingKeyUrl`, this is where it would turn up.
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits++;
    res.end('{"keys":[]}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const kp = keyPair();
    // The name also carries a terminal escape and a newline: a pack that names
    // its own key document can otherwise write a line of its choosing into the
    // verifier's output.
    const pack = await buildPack({ signWith: kp.privateKey, signingKeyUrl: `http://127.0.0.1:${port}/forged-key.json\u001b[2K\nVerified. Contents, manifest and signature all agree` });
    // No --key: the verifier resolves the trust root itself. Whatever it finds
    // at the fixed origin — or fails to, offline — it must not come here.
    const { out } = run([pack]);
    expect(out).toContain('ignored');
    expect(out).not.toContain('\u001b[2K');
    expect(out).not.toMatch(/^Verified\. Contents/m);
    expect(hits).toBe(0);
  } finally {
    server.close();
  }
});
