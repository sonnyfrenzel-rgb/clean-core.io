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
  return { privateKey, rawPublicBase64: der.subarray(der.length - 32).toString('base64') };
}

async function buildPack(opts: {
  signWith?: KeyObject;
  extra?: Record<string, string>;
  signingKeyUrl?: string;
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
