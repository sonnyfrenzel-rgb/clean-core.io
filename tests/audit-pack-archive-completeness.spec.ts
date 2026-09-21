import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'crypto';
import { verifyAuditPack, zipKey } from '../lib/audit-pack-verify';
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

/**
 * An archive that carries a signed path twice.
 *
 * JSZip holds a loaded archive in a map keyed by name, so two entries under one
 * name arrive as one — the later wins. Put the stranger first and the sealed
 * file second and every listed hash, the manifest hash and the signature agree,
 * while an extractor that takes the first entry hands the reader the other file.
 * The manifest names each path once.
 */
async function packListingTwice() {
  const content = '# Executive Summary\nA pack assembled for the completeness check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  const manifest = {
    version: '2.0', ...bound, generatedAt: new Date().toISOString(), files,
    manifestHash: sha(canonicalAuditManifest({ files, ...bound })), signed: false, signature: '',
  };
  const zip = new JSZip();
  // The same length as the signed path, so the name can be rewritten in place
  // once the archive is assembled. First in the archive, sealed file second.
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
  return { bytes, rewritten };
}

test('a path the archive carries twice is not the archive that was sealed', async () => {
  const { bytes, rewritten } = await packListingTwice();
  expect(rewritten, 'the decoy name was not written into both headers — the check would be vacuous').toBe(2);
  const result = await verifyAuditPack(bytes as unknown as Blob);
  // The sealed file is the one JSZip kept, so every listed hash still agrees —
  // which is exactly why the archive has to be asked as well.
  expect(result.fileIntegrity.find((f) => f.path === '00-executive-summary.md')?.valid).toBe(true);
  expect(result.manifestHashValid).toBe(true);
  expect(result.integrityValid, 'an archive listing a signed path twice passed integrity').toBe(false);
  expect(result.status).not.toBe('authentic');
  expect(result.errors.some((e) => e.includes('more than once'))).toBe(true);
});

test('the name resolution is measured against JSZip, not asserted', async () => {
  // The rule the duplicate check depends on is JSZip's, not ours, and the first
  // version of `zipKey` guessed one detail wrong: it dropped a leading slash,
  // which JSZip keeps — two entries JSZip holds apart would have been reported
  // as one, failing a genuine pack (QA review of 351e169c50a7). So the
  // expectation is taken from JSZip at run time rather than written down here:
  // whatever it keys an entry as, `zipKey` has to return the same string. If a
  // future JSZip changes the rule, this goes red instead of the check going
  // quietly wrong.
  const names = [
    'manifest.json',
    '/manifest.json',
    '//manifest.json',
    'a//b.json',
    './a/./b.json',
    'a/../../b.json',
    'x/../00-executive-summary.md',
    'evidence/./run.json',
  ];
  for (const name of names) {
    const zip = new JSZip();
    zip.file(name, 'X');
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
    const asJszipKeysIt = Object.keys(loaded.files).filter((k) => !k.endsWith('/'));
    expect(asJszipKeysIt, `JSZip made more or fewer than one file entry out of ${name}`).toHaveLength(1);
    expect(zipKey(name), `zipKey disagrees with JSZip about ${name}`).toBe(asJszipKeysIt[0]);
  }
});

/**
 * The same trick one alias further.
 *
 * JSZip resolves `.` and `..` before it keys its map, so `x/../00-…md` and
 * `00-…md` are one entry to it and two names in the central directory. A check
 * that compared the raw names therefore found no duplicate for the very case it
 * exists to catch (QA review of fce34641821e). The decoy goes first, so an
 * extractor that takes the first entry — or one that writes `x/../00-…md` out
 * literally — hands the reader a file nobody signed.
 */
async function packListingAnAlias() {
  const content = '# Executive Summary\nA pack assembled for the completeness check.';
  const files = [{ path: '00-executive-summary.md', sha256: sha(content), bytes: content.length }];
  const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
  const manifest = {
    version: '2.0', ...bound, generatedAt: new Date().toISOString(), files,
    manifestHash: sha(canonicalAuditManifest({ files, ...bound })), signed: false, signature: '',
  };
  const zip = new JSZip();
  // Same byte length as the alias, so the name can be rewritten in place.
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
  return { bytes, rewritten };
}

test('an alias of a signed path counts as the same path', async () => {
  const { bytes, rewritten } = await packListingAnAlias();
  expect(rewritten, 'the alias was not written into both headers — the check would be vacuous').toBe(2);
  const result = await verifyAuditPack(bytes as unknown as Blob);
  expect(result.integrityValid, 'an archive carrying an alias of a signed path passed integrity').toBe(false);
  expect(result.status).not.toBe('authentic');
  expect(result.errors.some((e) => e.includes('more than once'))).toBe(true);
});

test.describe('a signed file is measured as the bytes in the archive', () => {
  /**
   * The issuer hashes the UTF-8 bytes of the text it wrote
   * (`/api/audit-pack/create`), and the offline verifier hashes the bytes of the
   * entry. Reading the entry back as text and hashing the decoded string
   * measures a third thing: every byte a UTF-8 decoder cannot read becomes
   * U+FFFD, and U+FFFD encodes back to the three bytes of U+FFFD — so two
   * archives that differ in their bytes get the same number, and one of them was
   * never sealed. The two verifiers would then answer differently about the same
   * file, which is the one thing they may never do.
   */
  const text = '# Executive Summary\nSealed with a replacement character: �\n';
  const sealed = Buffer.from(text, 'utf8');
  const marker = Buffer.from('�', 'utf8');
  const at = sealed.indexOf(marker);
  // The same file with those three bytes replaced by one byte that is not a
  // valid UTF-8 sequence on its own.
  const altered = Buffer.concat([sealed.subarray(0, at), Buffer.from([0xff]), sealed.subarray(at + marker.length)]);

  async function packCarrying(body: Buffer) {
    const files = [{ path: '00-executive-summary.md', sha256: sha(text), bytes: sealed.length }];
    const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
    const manifest = {
      version: '2.0', ...bound, generatedAt: new Date().toISOString(), files,
      manifestHash: sha(canonicalAuditManifest({ files, ...bound })), signed: false, signature: '',
    };
    const zip = new JSZip();
    zip.file('00-executive-summary.md', body);
    zip.file('manifest.json', JSON.stringify(manifest));
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  test('the sealed bytes still verify', async () => {
    const result = await verifyAuditPack((await packCarrying(sealed)) as unknown as Blob);
    expect(result.integrityValid, 'a genuine pack no longer matches its own manifest').toBe(true);
    expect(result.fileIntegrity.find((f) => f.path === '00-executive-summary.md')?.valid).toBe(true);
  });

  test('bytes the manifest never covered do not', async () => {
    expect(altered.equals(sealed), 'the two bodies are the same bytes — the check would be vacuous').toBe(false);
    const result = await verifyAuditPack((await packCarrying(altered)) as unknown as Blob);
    const row = result.fileIntegrity.find((f) => f.path === '00-executive-summary.md');
    expect(row?.actualHash, 'the digest is the one of the file that was sealed').not.toBe(sha(text));
    expect(row?.valid).toBe(false);
    expect(result.integrityValid).toBe(false);
    expect(result.status).not.toBe('authentic');
    expect(result.success).toBe(false);
  });

  test('and so does an attested file whose bytes were changed', async () => {
    // Manifest version 3 binds the attested digest, so the same question is
    // asked of the account holder's own statement.
    const statement = '# Statements\nSign-off: not given. �\n';
    const statementBytes = Buffer.from(statement, 'utf8');
    const j = statementBytes.indexOf(marker);
    const changed = Buffer.concat([statementBytes.subarray(0, j), Buffer.from([0xff]), statementBytes.subarray(j + marker.length)]);
    const files = [{ path: '00-executive-summary.md', sha256: sha(text), bytes: sealed.length }];
    const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(statement) }];
    const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
    const generatedAt = new Date().toISOString();
    const manifest = {
      version: '3.0', ...bound, generatedAt, files, attested,
      manifestHash: sha(canonicalAuditManifest({ files, attested, ...bound, version: '3.0', generatedAt })),
      signed: false, signature: '',
    };
    const zip = new JSZip();
    zip.file('00-executive-summary.md', sealed);
    zip.file('07-user-attested.md', changed);
    zip.file('manifest.json', JSON.stringify(manifest));
    const result = await verifyAuditPack((await zip.generateAsync({ type: 'nodebuffer' })) as unknown as Blob);
    expect(result.fileIntegrity.find((f) => f.path === '07-user-attested.md')?.valid).toBe(false);
    expect(result.integrityValid).toBe(false);
  });
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
