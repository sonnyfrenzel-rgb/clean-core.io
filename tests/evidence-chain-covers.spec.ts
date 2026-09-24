import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  canonicalAuditManifest,
  canonicalManifestDefect,
  bindsCoverage,
  MANIFEST_VERSION_ED25519,
  MANIFEST_VERSION_HMAC,
} from '../lib/audit-pack-canonical';
import { CHAIN_STEPS, buildEvidenceChain, coversOf, type CoverEntry } from '../lib/evidence-chain';
import { auditPackCovers, buildAuditPackContents, attestationsOf } from '../lib/audit-pack-build';
import { EVIDENCE_CHAIN_FILE, USER_ATTESTED_FILE } from '../lib/audit-pack';

/**
 * Roadmap 8.5 — the handover chain, and what the signature does not cover.
 *
 * Three things are checked here, and each of them is a way the step could have
 * been done comfortably instead.
 *
 * 1. **`covers[]` distinguishes.** A manifest that lists everything under one
 *    heading would read as though the signature stood behind the account
 *    holder's own sign-off as much as behind the engine's findings. The decision
 *    link may therefore never say `signed`, and a row that claims the signature
 *    covers a file listed only under `attested` is refused — by both verifiers,
 *    even when the forger recomputes the hash and signs it again with a key of
 *    their own.
 * 2. **A missing link is a named hole.** All four links are always present. A
 *    chain that drops the ones it cannot fill is refused, because three rows
 *    that all say `signed` read as a complete chain.
 * 3. **Every pack sealed before this still verifies, byte for byte** (C23-A02).
 *    The `covers=` section is written only from manifest format 4, so a format-2
 *    or format-3 manifest canonicalises to the string it was signed with — the
 *    pre-8.5 form is rebuilt here rather than asserted, so the comparison can
 *    fail.
 */

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const SCRIPT = join(process.cwd(), 'scripts', 'verify-pack.mjs');

/* ------------------------------------------------------------------ chain */

const runWithReceipt = {
  projectId: 'p-1',
  runId: 'r-1',
  modelParticipation: 'narrative-attested' as const,
};

test('the chain names all four links, in order, whatever is on record', () => {
  for (const src of [
    { projectId: 'p', runId: 'r' },
    runWithReceipt,
    { ...runWithReceipt, modelParticipation: 'none' as const },
    { ...runWithReceipt, modelParticipation: 'narrative' as const },
  ]) {
    const chain = buildEvidenceChain(src);
    expect(chain.steps.map((s) => s.id)).toEqual([...CHAIN_STEPS]);
    for (const step of chain.steps) {
      // Determined or not, never in between — and a reason exactly where the
      // value is missing.
      expect(step.value === null ? typeof step.reason : step.reason, `${step.id}`).toBe(
        step.value === null ? 'string' : null,
      );
      expect(step.scope.length, `${step.id} says nothing about what it does not cover`).toBeGreaterThan(20);
    }
  }
});

test('the decision link is the account holders statement and can never be signed', () => {
  const decision = buildEvidenceChain(runWithReceipt).steps.find((s) => s.id === 'decision')!;
  expect(decision.coverage).toBe('attested');
  expect(decision.ref).toBe(USER_ATTESTED_FILE);
  expect(decision.provenance).toBe('not-determined');
  expect(decision.reason).toContain(USER_ATTESTED_FILE);
});

test('a receipt is only proven where something outside the account checked it', () => {
  const withReceipt = buildEvidenceChain(runWithReceipt).steps.find((s) => s.id === 'receipt')!;
  expect(withReceipt.coverage).toBe('signed');
  expect(withReceipt.provenance).toBe('proven');
  expect(withReceipt.scope).toContain('does not cover the decision');

  for (const participation of ['narrative', 'none', undefined] as const) {
    const step = buildEvidenceChain({ ...runWithReceipt, modelParticipation: participation }).steps.find(
      (s) => s.id === 'receipt',
    )!;
    expect(step.coverage, `modelParticipation=${participation}`).toBe('not-determined');
    expect(step.provenance).toBe('not-determined');
    expect(step.ref).toBe('');
    expect(step.reason).toBeTruthy();
  }
});

test('requirement and delivery are open, and say so with a reason rather than a zero', () => {
  const chain = buildEvidenceChain(runWithReceipt);
  for (const id of ['requirement', 'delivery'] as const) {
    const step = chain.steps.find((s) => s.id === id)!;
    expect(step.value).toBeNull();
    expect(step.coverage).toBe('not-determined');
    expect(step.reason!.length).toBeGreaterThan(80);
  }
  expect(chain.complete).toBe(false);
  expect(chain.determined).toBe(1);
  expect(chain.of).toBe(4);
  expect(chain.endsAt).toBe('requirement');
});

/* ------------------------------------------- the pack the issuer builds */

const run = {
  runId: 'run-1',
  projectId: 'proj-1',
  createdAt: '2026-09-23T08:00:00.000Z',
  status: 'completed',
  analyzerVersion: '2.15.0',
  rulesetVersion: 'rules-v1.0',
  sapApiCatalogVersion: '2026.09',
  extensibilityRoute: 'rap',
  cleanCoreScore: 71,
  evidenceReport: [],
  worklist: [],
  originalRecommendation: 'rap',
  runHash: 'b'.repeat(64),
};
const auditMetadata = {
  inputFingerprint: { sha256: 'a'.repeat(64), fileName: 'z.abap', lineCount: 10, byteSize: 100, uploadedAt: '2026-09-23T08:00:00.000Z', objectType: 'Report' },
  modelCard: { provider: 'google-gemini', model: 'gemini-3-flash-preview', modelParticipation: 'narrative-attested' as const, engineVersion: '2.15.0', byokUsed: false },
};
const source = (attested: Record<string, unknown>) => ({
  projectId: 'proj-1',
  runId: 'run-1',
  run: run as Record<string, unknown>,
  auditMetadata,
  attested: attestationsOf(attested),
});

test('the pack carries the chain as a signed file, and covers[] repeats it', () => {
  const { signed } = buildAuditPackContents(source({}));
  expect(Object.keys(signed)).toContain(EVIDENCE_CHAIN_FILE);
  const file = JSON.parse(signed[EVIDENCE_CHAIN_FILE]);
  expect(file.steps.map((s: { id: string }) => s.id)).toEqual([...CHAIN_STEPS]);
  expect(auditPackCovers(source({}))).toEqual(
    file.steps.map((s: { id: string; coverage: string; ref: string }) => ({ step: s.id, coverage: s.coverage, ref: s.ref })),
  );
});

test('no client-writable field can move a row of covers[]', () => {
  const honest = auditPackCovers(source({ targetArchitecture: 'rap', approvedByArchitect: false }));
  const forged = auditPackCovers(
    source({
      name: 'Approved by the board',
      targetArchitecture: 'retire',
      approvedByArchitect: true,
      approvedBy: 'cto@example.com',
      architectSignOffAt: '2026-09-23T09:00:00.000Z',
      architectJustifiedOverride: 'Nothing to migrate.',
    }),
  );
  expect(forged).toEqual(honest);
});

/* --------------------------------------------------- the canonical form */

const FILES = [
  { path: '00-executive-summary.md', sha256: '0'.repeat(64) },
  { path: '04-model-card.md', sha256: '4'.repeat(64) },
];
const ATTESTED = [{ path: USER_ATTESTED_FILE, sha256: '7'.repeat(64) }];
const BOUND = { projectId: 'p', runId: 'r', runHash: 'h', engineVersion: 'v1.0', sapApiCatalogVersion: '2024.FPS02' };
const GENERATED_AT = '2026-09-23T10:00:00.000Z';
const COVERS: CoverEntry[] = coversOf(buildEvidenceChain(runWithReceipt));

/** The form as it stood before 23.09.2026, rebuilt so the comparison can fail. */
function formBefore85(version: string): string {
  const esc = (s: string) => s.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/;/g, '%3B');
  const files = [...FILES].sort((a, b) => a.path.localeCompare(b.path));
  return (
    files.map((f) => `${f.path}:${f.sha256}`).join(';') +
    ';' +
    `${esc(BOUND.projectId)}:${esc(BOUND.runId)}:${esc(BOUND.runHash)}:${esc(BOUND.engineVersion)}:${esc(BOUND.sapApiCatalogVersion)};` +
    `attested=${ATTESTED.map((a) => `${a.path}:${a.sha256}`).join(',')};` +
    `issued=${version}:${GENERATED_AT};`
  );
}

test('a format-3 pack canonicalises byte for byte as it did before 8.5', () => {
  expect(bindsCoverage('3.1')).toBe(false);
  expect(
    canonicalAuditManifest({ files: FILES, attested: ATTESTED, ...BOUND, version: '3.1', generatedAt: GENERATED_AT }),
  ).toBe(formBefore85('3.1'));
  // A version-2 pack, too: no issuance section, attested by name only.
  expect(canonicalAuditManifest({ files: FILES, attested: [{ path: USER_ATTESTED_FILE }], ...BOUND })).toBe(
    [...FILES].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}:${f.sha256}`).join(';') +
      `;p:r:h:v1.0:2024.FPS02;attested=${USER_ATTESTED_FILE};`,
  );
});

test('a covers[] in a format that does not bind it is refused, not ignored', () => {
  expect(
    canonicalManifestDefect({ files: FILES, attested: ATTESTED, ...BOUND, version: '3.1', generatedAt: GENERATED_AT, covers: COVERS }),
  ).toMatch(/does not bind it/);
});

test('covers[] is inside the signed string, so no row can be moved after sealing', () => {
  const parts = { files: FILES, attested: ATTESTED, ...BOUND, version: MANIFEST_VERSION_ED25519, generatedAt: GENERATED_AT };
  const honest = canonicalAuditManifest({ ...parts, covers: COVERS });
  expect(honest.endsWith(`covers=${[...COVERS].sort((a, b) => a.step.localeCompare(b.step)).map((c) => `${c.step}:${c.coverage}:${c.ref}`).join(',')};`)).toBe(true);
  // The decision link promoted onto a signed file: a different string, so a
  // different hash, so a signature that no longer verifies.
  const promoted = COVERS.map((c) => (c.step === 'decision' ? { ...c, coverage: 'signed' as const, ref: '04-model-card.md' } : c));
  expect(canonicalAuditManifest({ ...parts, covers: promoted })).not.toBe(honest);
});

test('a row cannot claim the signature covers a file the manifest does not sign', () => {
  const parts = { files: FILES, attested: ATTESTED, ...BOUND, version: MANIFEST_VERSION_ED25519, generatedAt: GENERATED_AT };
  // The attested file, claimed as signed — refused even by a forger who
  // recomputes the hash and signs it again.
  expect(
    canonicalManifestDefect({
      ...parts,
      covers: COVERS.map((c) => (c.step === 'decision' ? { ...c, coverage: 'signed' as const } : c)),
    }),
  ).toMatch(/does not list under files/);
  // A signed file, claimed as the user's statement.
  expect(
    canonicalManifestDefect({
      ...parts,
      covers: COVERS.map((c) => (c.step === 'receipt' ? { ...c, coverage: 'attested' as const } : c)),
    }),
  ).toMatch(/does not list under attested/);
  // An open link that still names a file.
  expect(
    canonicalManifestDefect({
      ...parts,
      covers: COVERS.map((c) => (c.step === 'delivery' ? { ...c, ref: '04-model-card.md' } : c)),
    }),
  ).toMatch(/is not determined and still names a file/);
});

test('a chain with a link dropped is refused, and so is one with a link twice', () => {
  const parts = { files: FILES, attested: ATTESTED, ...BOUND, version: MANIFEST_VERSION_ED25519, generatedAt: GENERATED_AT };
  expect(canonicalManifestDefect({ ...parts, covers: COVERS.filter((c) => c.step !== 'delivery') })).toMatch(
    /does not account for every link/,
  );
  expect(canonicalManifestDefect({ ...parts, covers: [...COVERS, COVERS[0]] })).toMatch(/is listed twice/);
  expect(canonicalManifestDefect({ ...parts, covers: undefined })).toMatch(/must name the handover chain/);
  expect(canonicalManifestDefect({ ...parts, covers: COVERS })).toBeNull();
});

test('the issuer seals packs in the format that binds the chain', () => {
  expect(bindsCoverage(MANIFEST_VERSION_HMAC)).toBe(true);
  expect(bindsCoverage(MANIFEST_VERSION_ED25519)).toBe(true);
});

/* ------------------------------------------------- the offline verifier */

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return { privateKey, rawPublicBase64: der.subarray(der.length - 32).toString('base64') };
}

/**
 * The canonical string as a forger would build it — by the format's rules and
 * not through the issuer's function, which refuses a defective manifest before
 * it hashes one. Without this the "signed again" cases could not be built at
 * all, and the check would be about the issuer rather than about the verifier.
 */
function forgedCanonical(
  files: { path: string; sha256: string }[],
  attested: { path: string; sha256: string }[],
  covers: CoverEntry[],
  meta: { projectId: string; runId: string; runHash: string; engineVersion: string; sapApiCatalogVersion: string; version: string; generatedAt: string },
): string {
  const esc = (s: string) => s.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/;/g, '%3B');
  return (
    [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}:${f.sha256}`).join(';') +
    ';' +
    `${esc(meta.projectId)}:${esc(meta.runId)}:${esc(meta.runHash)}:${esc(meta.engineVersion)}:${esc(meta.sapApiCatalogVersion)};` +
    `attested=${[...attested].sort((a, b) => a.path.localeCompare(b.path)).map((a) => `${a.path}:${a.sha256}`).join(',')};` +
    `issued=${meta.version}:${meta.generatedAt};` +
    `covers=${[...covers].sort((a, b) => a.step.localeCompare(b.step)).map((c) => `${c.step}:${c.coverage}:${c.ref}`).join(',')};`
  );
}

async function buildPack(opts: { covers: CoverEntry[]; privateKey: ReturnType<typeof keyPair>['privateKey']; forge?: boolean }) {
  const summary = '# Executive Summary\nA pack with a handover chain.';
  const card = '# Model card\nA receipt established the narrative origin.';
  const statement = '# User-attested\nArchitect sign-off: not given.';
  const files = [
    { path: '00-executive-summary.md', sha256: sha(summary), bytes: summary.length },
    { path: '04-model-card.md', sha256: sha(card), bytes: card.length },
  ];
  const attested = [{ path: USER_ATTESTED_FILE, provenance: 'user-attested' as const, sha256: sha(statement) }];
  const meta = { ...BOUND, version: MANIFEST_VERSION_ED25519, generatedAt: GENERATED_AT };
  // Built with the issuer's own function; the script must arrive at the same
  // bytes on its own, or it is checking a signature over something else.
  const canonical = opts.forge
    ? forgedCanonical(files, attested, opts.covers, meta)
    : canonicalAuditManifest({ files, attested, covers: opts.covers, ...meta });
  const manifestHash = sha(canonical);
  const manifest = {
    ...meta,
    files,
    attested,
    covers: opts.covers,
    manifestHash,
    signed: true,
    signature: '',
    signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), opts.privateKey).toString('base64'),
  };
  const zip = new JSZip();
  zip.file('00-executive-summary.md', summary);
  zip.file('04-model-card.md', card);
  zip.file(USER_ATTESTED_FILE, statement);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const packPath = join(mkdtempSync(join(tmpdir(), 'chain-pack-')), 'pack.zip');
  writeFileSync(packPath, await zip.generateAsync({ type: 'nodebuffer' }));
  return packPath;
}

function runCli(args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: process.cwd() });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

test('the offline verifier arrives at the same bytes and prints every link', async () => {
  const kp = keyPair();
  const { code, out } = runCli([await buildPack({ covers: COVERS, privateKey: kp.privateKey }), '--key', kp.rawPublicBase64]);
  expect(out).toContain('Verified.');
  for (const label of ['Requirement', 'Decision', 'Receipt', 'Delivery artefact']) expect(out).toContain(label);
  expect(out).toContain('attested');
  expect(out).toContain('not-determined');
  // The verdict is two sentences: genuine, and standing behind one link of four.
  expect(out).toContain('3 of 4 links of the handover chain are not covered');
  expect(code).toBe(0);
});

test('the offline verifier refuses a promoted row even when it is signed again', async () => {
  const kp = keyPair();
  const promoted = COVERS.map((c) => (c.step === 'decision' ? { ...c, coverage: 'signed' as const } : c));
  const { code, out } = runCli([await buildPack({ covers: promoted, privateKey: kp.privateKey, forge: true }), '--key', kp.rawPublicBase64]);
  expect(out).toContain('does not list under files');
  expect(out).toContain('NOT verified');
  expect(code).toBe(1);
});

test('the offline verifier refuses a chain with a link dropped', async () => {
  const kp = keyPair();
  const short = COVERS.filter((c) => c.step !== 'delivery');
  const { code, out } = runCli([await buildPack({ covers: short, privateKey: kp.privateKey, forge: true }), '--key', kp.rawPublicBase64]);
  expect(out).toContain('does not account for every link');
  expect(code).toBe(1);
});
