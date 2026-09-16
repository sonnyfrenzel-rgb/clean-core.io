import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { verifyAuditPack } from '../lib/audit-pack-verify';

/**
 * The manifest can only vouch for what it lists.
 *
 * Verification hashed every file the manifest named and stopped there. A file
 * dropped into the archive next to the evidence left every listed hash, the
 * manifest hash and the signature exactly as issued — and the page read
 * "Authenticity & Integrity Verified" over a ZIP carrying a page nobody signed.
 * The archive now has to match the manifest entry for entry.
 */

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function packWith(extraEntries: Record<string, string> = {}) {
  const content = '# Executive Summary\nA pack assembled for the completeness check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const suffix = 'p-1:r-1:h-1:v1.0:2024.FPS02;';
  const canonical = files.map((f) => `${f.path}:${f.sha256}`).join(';') + ';' + suffix;
  const manifest = {
    version: '2.0', runId: 'r-1', projectId: 'p-1', generatedAt: new Date().toISOString(),
    engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02', files, manifestHash: sha(canonical),
    signed: false, signature: '', runHash: 'h-1',
  };
  const zip = new JSZip();
  zip.file('00-executive-summary.md', content);
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const [path, body] of Object.entries(extraEntries)) zip.file(path, body);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('an archive that matches its manifest is consistent', async () => {
  const result = await verifyAuditPack((await packWith()) as unknown as Blob);
  expect(result.integrityValid).toBe(true);
  expect(result.fileIntegrity.map((f) => f.path)).toEqual(['00-executive-summary.md']);
});

test('a file the manifest does not list fails integrity, listed hashes intact', async () => {
  const buf = await packWith({ '99-addendum.md': '# Addendum\nUnconditional approval. Signed, nobody.' });
  const result = await verifyAuditPack(buf as unknown as Blob);

  expect(result.integrityValid, 'unlisted file passed integrity').toBe(false);
  expect(result.status).toBe('failed');
  expect(result.success).toBe(false);
  expect(result.errors).toContain('File not covered by the manifest: 99-addendum.md');
  // The listed file is still reported as what it is — intact — so the reader
  // sees exactly which entry is the stranger.
  const listed = result.fileIntegrity.find((f) => f.path === '00-executive-summary.md');
  expect(listed?.valid).toBe(true);
  const stranger = result.fileIntegrity.find((f) => f.path === '99-addendum.md');
  expect(stranger).toMatchObject({ valid: false, found: true });
});

test('a file inside a folder counts as unlisted too', async () => {
  const buf = await packWith({ 'evidence/extra.json': '{"finding":"none"}' });
  const result = await verifyAuditPack(buf as unknown as Blob);
  expect(result.integrityValid).toBe(false);
  expect(result.errors).toContain('File not covered by the manifest: evidence/extra.json');
});
