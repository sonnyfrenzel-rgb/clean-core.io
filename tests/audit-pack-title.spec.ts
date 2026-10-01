import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { canonicalAuditManifest, MANIFEST_VERSION_ED25519 } from '../lib/audit-pack-canonical';
import { auditPackCovers, buildAuditPackContents, type AuditPackSource } from '../lib/audit-pack-build';
import { generateExecutiveSummary, generateExecutiveSummaryDoc } from '../lib/audit-pack';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import type { Project } from '../lib/types';

/**
 * The signed executive summary is titled "Audit Pack" (owner decision
 * 01.10.2026), not "Compliance Audit Pack".
 *
 * The title sits inside `00-executive-summary.md` and `.doc`, both signed, so
 * the change moves the signed bytes of every pack issued from now on — and of
 * none issued before. That is safe only because verification compares each
 * file with the digest its own manifest recorded, and never with what the
 * generator would write today. Both halves are proved here with a pack
 * assembled the way `/api/audit-pack/create` assembles one, signed with an
 * Ed25519 key, and checked by both verifiers: the in-app one and the offline
 * script. The "old" pack is the same pack with the old title written back into
 * the two files before sealing — exactly what an earlier issuer produced.
 */

const OLD_TITLE = 'Compliance Audit Pack';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const SCRIPT = join(process.cwd(), 'scripts', 'verify-pack.mjs');

const SOURCE: AuditPackSource = {
  projectId: 'p-title',
  runId: 'r-title',
  run: {
    createdAt: '2026-10-01T08:00:00.000Z',
    runHash: 'h-title',
    analyzerVersion: 'v2.20.0',
    sapApiCatalogVersion: '2024.FPS02',
    cleanCoreScore: 42,
    worklist: [],
  },
  attested: {},
};

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { privateKey, rawPublicBase64: der.subarray(der.length - 32).toString('base64') };
}

/** Seals the contents as the issuing route does: digests, canonical string, signature, archive. */
async function seal(
  contents: { signed: Record<string, string>; attested: Record<string, string> },
  privateKey: ReturnType<typeof keyPair>['privateKey'],
) {
  const enc = new TextEncoder();
  const files = Object.entries(contents.signed).map(([path, c]) => ({ path, sha256: sha(c), bytes: enc.encode(c).byteLength }));
  const attested = Object.entries(contents.attested).map(([path, c]) => ({ path, provenance: 'user-attested' as const, sha256: sha(c) }));
  const covers = auditPackCovers(SOURCE);
  const meta = {
    projectId: SOURCE.projectId,
    runId: SOURCE.runId,
    runHash: 'h-title',
    engineVersion: 'v2.20.0',
    sapApiCatalogVersion: '2024.FPS02',
    version: MANIFEST_VERSION_ED25519,
    generatedAt: '2026-10-01T09:00:00.000Z',
  };
  const manifestHash = sha(canonicalAuditManifest({ files, attested, covers, ...meta }));
  const manifest = {
    ...meta,
    files,
    attested,
    covers,
    manifestHash,
    signed: true,
    signature: '',
    signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), privateKey).toString('base64'),
  };
  const zip = new JSZip();
  for (const [path, c] of Object.entries(contents.signed)) zip.file(path, c);
  for (const [path, c] of Object.entries(contents.attested)) zip.file(path, c);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const buf: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const packPath = join(mkdtempSync(join(tmpdir(), 'title-pack-')), 'pack.zip');
  writeFileSync(packPath, buf);
  return { buf, packPath };
}

/** The same contents with the title an earlier issuer wrote. */
function withOldTitle(contents: { signed: Record<string, string>; attested: Record<string, string> }) {
  const signed = { ...contents.signed };
  for (const f of ['00-executive-summary.md', '00-executive-summary.doc']) {
    signed[f] = signed[f].replace(/Audit Pack — Executive Summary/g, `${OLD_TITLE} — Executive Summary`);
  }
  return { ...contents, signed };
}

function runCli(args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

test('a newly generated summary is titled "Audit Pack", in both formats', () => {
  const project = { id: 'p', activeRunId: 'r' } as unknown as Project;
  const md = generateExecutiveSummary(project);
  const doc = generateExecutiveSummaryDoc(project);
  expect(md.startsWith('# Audit Pack — Executive Summary\n')).toBe(true);
  expect(doc).toContain('<title>Audit Pack — Executive Summary</title>');
  expect(doc).toContain('<h1>Audit Pack — Executive Summary</h1>');
  expect(md).not.toContain(OLD_TITLE);
  expect(doc).not.toContain(OLD_TITLE);
});

test('the new title changes the signed bytes, and a new pack verifies', async () => {
  const fresh = buildAuditPackContents(SOURCE);
  const old = withOldTitle(fresh);
  // The rewrite really moved the signed files — otherwise the old-pack case
  // below would prove nothing.
  expect(old.signed['00-executive-summary.md']).not.toBe(fresh.signed['00-executive-summary.md']);
  expect(old.signed['00-executive-summary.doc']).toContain(OLD_TITLE);

  const kp = keyPair();
  const { buf, packPath } = await seal(fresh, kp.privateKey);
  const result = await verifyAuditPack(buf as unknown as Blob);
  expect(result.integrityValid, result.errors.join('\n')).toBe(true);
  expect(result.manifestHashValid).toBe(true);
  const cli = runCli([packPath, '--key', kp.rawPublicBase64]);
  expect(cli.out).toContain('Verified.');
  expect(cli.code).toBe(0);
});

test('a pack sealed with the old title still verifies', async () => {
  const old = withOldTitle(buildAuditPackContents(SOURCE));
  const kp = keyPair();
  const { buf, packPath } = await seal(old, kp.privateKey);
  const result = await verifyAuditPack(buf as unknown as Blob);
  expect(result.integrityValid, result.errors.join('\n')).toBe(true);
  expect(result.manifestHashValid).toBe(true);
  const cli = runCli([packPath, '--key', kp.rawPublicBase64]);
  expect(cli.out).toContain('Verified.');
  expect(cli.code).toBe(0);
});

test('a sealed old pack whose title is rewritten to the new one afterwards fails', async () => {
  const kp = keyPair();
  const { buf } = await seal(withOldTitle(buildAuditPackContents(SOURCE)), kp.privateKey);
  // Take the old pack and write the new title into it after sealing.
  const zip = await JSZip.loadAsync(buf);
  const md = await zip.file('00-executive-summary.md')!.async('string');
  zip.file('00-executive-summary.md', md.replace(`${OLD_TITLE} — Executive Summary`, 'Audit Pack — Executive Summary'));
  const tampered = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await verifyAuditPack(tampered as unknown as Blob);
  expect(result.integrityValid).toBe(false);
  expect(result.fileIntegrity.find((f) => f.path === '00-executive-summary.md')?.valid).toBe(false);
});
