import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';
import { verifyAuditPack, verdictHeadline, verdictState } from '../lib/audit-pack-verify';

/**
 * SEC-66dd82b-01. Before manifest format 3 the issue date is outside the signed
 * string, and project, run, engine and catalog are bound only as one
 * colon-joined string. Both verifiers print those values. A verdict that reads
 * as fully verified over values the signature does not cover is the verdict
 * this spec rules out: such a pack is verified in part, and says which fields
 * the signature leaves out. A pack whose format binds them stays green.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'verify-pack.mjs');
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const BODY = '# Summary\nClean core score 42.';
const META = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
const SEALED_AT = '2026-09-01T08:00:00.000Z';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return { privateKey, publicKey: raw.toString('base64'), keyId: sha(raw).slice(0, 16) };
}

/** A genuinely signed pack, then — after signing — its displayed issue date rewritten. */
async function pack(version: string, shownDate: string) {
  const k = keyPair();
  const files = [{ path: '00-executive-summary.md', sha256: sha(BODY), bytes: BODY.length }];
  const manifestHash = sha(canonicalAuditManifest({ files, ...META, version, generatedAt: SEALED_AT }));
  const manifest = {
    version, ...META, generatedAt: shownDate, files, manifestHash, signed: true, signature: '',
    signingKeyId: k.keyId,
    signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), k.privateKey).toString('base64'),
  };
  const zip = new JSZip();
  zip.file('00-executive-summary.md', BODY);
  zip.file('manifest.json', JSON.stringify(manifest));
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const packPath = join(mkdtempSync(join(tmpdir(), 'unbound-metadata-')), 'pack.zip');
  writeFileSync(packPath, bytes);
  const keyDoc = { keys: [{ keyId: k.keyId, algorithm: 'Ed25519', status: 'active', publicKey: k.publicKey }] };
  return { bytes, packPath, key: k.publicKey, keyDoc };
}

const web = (p: Awaited<ReturnType<typeof pack>>) =>
  verifyAuditPack(p.bytes as unknown as Blob, { fetchKeyDocument: async () => p.keyDoc });

const cli = (p: Awaited<ReturnType<typeof pack>>) => {
  const r = spawnSync(process.execPath, [SCRIPT, p.packPath, '--key', p.key], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};

test.describe.configure({ timeout: 60_000 });

test('metadata the signature does not cover never reads as verified', async () => {
  // Signed on 1 September, shown as 1 January: the signature still holds.
  const legacy = await pack('2.0', '2026-01-01T08:00:00.000Z');
  const result = await web(legacy);
  expect(result.ed25519?.state, result.errors.join(' | ')).toBe('verified');
  expect(result.status).toBe('authentic');
  expect(result.success, 'success over an issue date nobody signed').toBe(false);
  expect(verdictState(result)).toBe('warning');
  expect(verdictHeadline(result)).not.toBe('Authenticity & Integrity Verified');
  expect(verdictHeadline(result)).toBe('Signature Verified (Export Details Not Covered)');
  const notice = result.errors.join('\n');
  for (const field of ['issue date', 'project', 'run', 'engine', 'catalog']) expect(notice).toContain(field);
  expect(notice).toContain('not covered by the signature');

  const offline = cli(legacy);
  expect(offline.out).toContain('Ed25519 signature valid');
  expect(offline.out).not.toContain('Verified. Contents, manifest and signature all agree');
  expect(offline.out).toContain('not covered by the signature');
  // The verdict line is not printed green.
  expect(offline.out).not.toContain('\x1b[32mVerified.');
});

test('a pack whose format binds its metadata still reads as verified in full', async () => {
  const current = await pack('3.0', SEALED_AT);
  const result = await web(current);
  expect(result.status, result.errors.join(' | ')).toBe('authentic');
  expect(result.success).toBe(true);
  expect(verdictState(result)).toBe('success');
  expect(verdictHeadline(result)).toBe('Authenticity & Integrity Verified');

  const offline = cli(current);
  expect(offline.out).toContain('\x1b[32mVerified. Contents, manifest and signature all agree');
  expect(offline.code).toBe(0);

  // And the same rewrite on a bound pack is caught, not merely noted.
  const rewritten = await web(await pack('3.0', '2026-01-01T08:00:00.000Z'));
  expect(rewritten.status).toBe('failed');
});

test('the verify page marks each export detail the signature does not cover', () => {
  const page = readFileSync('app/(app)/verify-pack/page.tsx', 'utf8');
  expect(page).toContain('bindsIssuanceMetadata(result.manifest.version)');
  expect(page).toContain('not covered by the signature');
});
