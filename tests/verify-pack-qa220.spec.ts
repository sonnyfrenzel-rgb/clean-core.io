import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';
import { verifyAuditPack, PACK_LIMITS } from '../lib/audit-pack-verify';

/**
 * QA full review of v2.20.0, the two verifiers of an audit pack:
 *
 * - 0c3054f4f978 / ac12363e28b7: a small archive whose entry deflates into far
 *   more than any pack holds was expanded in full, by the web verifier and by
 *   `scripts/verify-pack.mjs` alike. Both now count bytes as they are produced
 *   and stop at a ceiling — and stopping is "could not check", never a verdict.
 * - 4d509e2bbc84: the CLI printed run id, paths and dates from the archive
 *   before any check, raw — a newline forged a status line of its own.
 * - 20d98b8a75b9 / ff57fe57b63b: a pack sealed before format 3 does not bind
 *   its issue date, and binds its run fields only as one colon-joined string.
 *   The CLI printed them as though they were checked.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'verify-pack.mjs');
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { privateKey, rawPublicBase64: der.subarray(der.length - 32).toString('base64') };
}

async function signedPack(opts: {
  entries: Record<string, string | Buffer>;
  meta?: Partial<Record<'projectId' | 'runId' | 'engineVersion' | 'sapApiCatalogVersion', string>>;
  version?: string;
  generatedAt?: string;
}) {
  const kp = keyPair();
  const files = Object.entries(opts.entries).map(([path, body]) => ({ path, sha256: sha(body), bytes: body.length }));
  const meta = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02', ...opts.meta };
  const version = opts.version ?? '2.0';
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const manifestHash = sha(canonicalAuditManifest({ files, ...meta, version, generatedAt }));
  const manifest = {
    version, ...meta, generatedAt, files, manifestHash, signed: true, signature: '',
    signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), kp.privateKey).toString('base64'),
  };
  const zip = new JSZip();
  for (const [path, body] of Object.entries(opts.entries)) zip.file(path, body);
  zip.file('manifest.json', JSON.stringify(manifest));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const packPath = join(mkdtempSync(join(tmpdir(), 'verify-pack-qa220-')), 'pack.zip');
  writeFileSync(packPath, bytes);
  return { packPath, bytes, key: kp.rawPublicBase64 };
}

function run(args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** A genuine, correctly signed entry — only far larger than any pack holds. Deflates to a few dozen kB. */
const oversized = () => Buffer.alloc(PACK_LIMITS.entryBytes + 1024 * 1024, 0x41);

test.describe.configure({ timeout: 120_000 });

test('the CLI stops expanding an entry past the ceiling and reports that it could not check', async () => {
  const { packPath, bytes, key } = await signedPack({ entries: { '00-executive-summary.md': oversized() } });
  expect(bytes.length, 'the archive itself is small').toBeLessThan(1024 * 1024);
  const { code, out } = run([packPath, '--key', key]);
  expect(out).toContain('expands beyond the size a pack may have');
  expect(out).not.toContain('Verified.');
  expect(code).toBe(2);
});

test('the web verifier stops expanding an entry past the ceiling and fails closed', async () => {
  const { bytes } = await signedPack({ entries: { '00-executive-summary.md': oversized() } });
  const result = await verifyAuditPack(bytes);
  expect(result.success).toBe(false);
  expect(result.status).toBe('failed');
  expect(result.errors.join('\n')).toContain('expands beyond the size a pack may have');
});

test('a pack within the limits still verifies in both verifiers', async () => {
  const { packPath, bytes, key } = await signedPack({ entries: { '00-executive-summary.md': '# Summary\nwithin limits' } });
  const { code, out } = run([packPath, '--key', key]);
  expect(out).toContain('Verified.');
  expect(code).toBe(0);
  const result = await verifyAuditPack(bytes);
  expect(result.integrityValid).toBe(true);
});

test('control characters from the manifest reach the terminal as escapes, not as lines or sequences', async () => {
  const { packPath, key } = await signedPack({
    entries: { '00-executive-summary.md': '# Summary' },
    meta: { runId: 'r-1\nOK        forged line\x1b[2J', engineVersion: 'v1\x1b[31m' },
  });
  const { out } = run([packPath, '--key', key]);
  expect(out.split('\n').some((l) => l.startsWith('OK        forged line')), 'a newline in runId printed a line of its own').toBe(false);
  expect(out).not.toContain('\x1b[2J');
  expect(out).not.toContain('v1\x1b[31m');
  expect(out).toContain('\\u000aOK        forged line\\u001b[2J');
});

test('a legacy pack says its issue date and run fields are its own claim; a format-3 pack does not', async () => {
  const legacy = await signedPack({ entries: { '00-executive-summary.md': '# Summary' }, version: '2.0' });
  const legacyOut = run([legacy.packPath, '--key', legacy.key]).out;
  expect(legacyOut).toContain('does not bind the issue date');
  expect(legacyOut).toContain("the values above are the pack's claim");

  const bound = await signedPack({ entries: { '00-executive-summary.md': '# Summary' }, version: '3.0' });
  const boundOut = run([bound.packPath, '--key', bound.key]).out;
  expect(boundOut).not.toContain('does not bind the issue date');

  // The web verifier says the same, as a notice beside its verdict (775bb2fffdba).
  const legacyWeb = await verifyAuditPack(legacy.bytes);
  expect(legacyWeb.integrityValid).toBe(true);
  expect(legacyWeb.errors.join('\n')).toContain("the values shown for them are the pack's own claim");
  const boundWeb = await verifyAuditPack(bound.bytes);
  expect(boundWeb.errors.join('\n')).not.toContain('does not bind the issue date');
});
