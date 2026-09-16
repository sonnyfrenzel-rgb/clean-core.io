import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'http';

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

async function buildPack(opts: { signWith?: KeyObject; extra?: Record<string, string>; signingKeyUrl?: string }) {
  const content = '# Executive Summary\nA pack built for the command-line check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const meta = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  const canonical =
    files.map((f) => `${f.path}:${f.sha256}`).join(';') +
    ';' +
    `${meta.projectId}:${meta.runId}:${meta.runHash}:${meta.engineVersion}:${meta.sapApiCatalogVersion};`;
  const manifestHash = sha(canonical);
  const manifest: Record<string, unknown> = {
    version: '2.0', ...meta, generatedAt: new Date().toISOString(), files, manifestHash, signed: false, signature: '',
  };
  if (opts.signWith) {
    manifest.signed = true;
    manifest.signatureEd25519 = sign(null, Buffer.from(manifestHash, 'utf8'), opts.signWith).toString('base64');
  }
  if (opts.signingKeyUrl) manifest.signingKeyUrl = opts.signingKeyUrl;

  const zip = new JSZip();
  zip.file('00-executive-summary.md', content);
  zip.file('manifest.json', JSON.stringify(manifest));
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
    const pack = await buildPack({ signWith: kp.privateKey, signingKeyUrl: `http://127.0.0.1:${port}/forged-key.json` });
    // No --key: the verifier resolves the trust root itself. Whatever it finds
    // at the fixed origin — or fails to, offline — it must not come here.
    const { out } = run([pack]);
    expect(out).toContain('ignored');
    expect(hits).toBe(0);
  } finally {
    server.close();
  }
});
