import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';

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

async function packWith(
  extraEntries: Record<string, string> = {},
  opts: { attested?: { path: string; provenance: 'user-attested' }[]; attestedContent?: Record<string, string> } = {},
) {
  const content = '# Executive Summary\nA pack assembled for the completeness check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  const canonical = canonicalAuditManifest({ files, attested: opts.attested, ...bound });
  const manifest = {
    version: '2.0', ...bound, generatedAt: new Date().toISOString(), files, manifestHash: sha(canonical),
    signed: false, signature: '', ...(opts.attested ? { attested: opts.attested } : {}),
  };
  const zip = new JSZip();
  zip.file('00-executive-summary.md', content);
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const [path, body] of Object.entries(opts.attestedContent || {})) zip.file(path, body);
  for (const [path, body] of Object.entries(extraEntries)) zip.file(path, body);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const ATTESTED = [{ path: '07-user-attested.md', provenance: 'user-attested' as const }];

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

test.describe('a user-attested file', () => {
  test('is accepted by name, reported as unsigned, and never as verified content', async () => {
    const buf = await packWith({}, { attested: ATTESTED, attestedContent: { '07-user-attested.md': '# Statements\nApprover: me.' } });
    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.integrityValid).toBe(true);
    expect(result.manifestHashValid).toBe(true);
    const row = result.fileIntegrity.find((f) => f.path === '07-user-attested.md');
    expect(row).toMatchObject({ found: true, valid: true, signed: false, expectedHash: '' });
    // The signed file keeps its ordinary row.
    expect(result.fileIntegrity.find((f) => f.path === '00-executive-summary.md')?.signed).toBeUndefined();
  });

  test('may say anything — its contents are the account holder\'s, and the pack stays consistent', async () => {
    const buf = await packWith({}, { attested: ATTESTED, attestedContent: { '07-user-attested.md': '# Statements\nApprover: the board, unanimously.' } });
    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.integrityValid).toBe(true);
    expect(result.fileIntegrity.find((f) => f.path === '07-user-attested.md')?.signed).toBe(false);
  });

  test('has to be there: the manifest bound its name', async () => {
    const buf = await packWith({}, { attested: ATTESTED });
    const result = await verifyAuditPack(buf as unknown as Blob);
    expect(result.integrityValid).toBe(false);
    expect(result.errors).toContain('Attested file missing from ZIP: 07-user-attested.md');
  });

  test('cannot be added after sealing — a second "attested" entry breaks the manifest hash', async () => {
    // The pack was sealed with one attested path; the manifest is edited to
    // list a second and the file dropped in. Names are in the canonical string.
    const content = '# Executive Summary\nA pack assembled for the completeness check.';
    const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
    const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
    const sealedCanonical = canonicalAuditManifest({ files, attested: ATTESTED, ...bound });
    const manifest = {
      version: '2.0', ...bound, generatedAt: new Date().toISOString(), files, manifestHash: sha(sealedCanonical),
      signed: false, signature: '',
      attested: [...ATTESTED, { path: '08-board-approval.md', provenance: 'user-attested' }],
    };
    const zip = new JSZip();
    zip.file('00-executive-summary.md', content);
    zip.file('07-user-attested.md', '# Statements');
    zip.file('08-board-approval.md', '# Approved. Signed, nobody.');
    zip.file('manifest.json', JSON.stringify(manifest));
    const result = await verifyAuditPack((await zip.generateAsync({ type: 'nodebuffer' })) as unknown as Blob);
    expect(result.manifestHashValid).toBe(false);
    expect(result.integrityValid).toBe(false);
  });
});
