import { test, expect } from '@playwright/test';
import { buildAuditPackContents, signedGeneratorInput, attestationsOf } from '../lib/audit-pack-build';
import { canonicalAuditManifest } from '../lib/audit-pack-canonical';
import { USER_ATTESTED_FILE } from '../lib/audit-pack';

/**
 * The signed half of an audit pack reads the run and nothing else.
 *
 * `/api/audit-pack/create` handed the generators `{ ...projectData, ...runData }`
 * and signed what came out. Every field in the client update allowlist of
 * `firestore.rules` therefore reached hashed, signed files — the chosen target
 * architecture, the sign-off, the approver, the override reason — and a value
 * typed into a form came out as server evidence with a signature on it.
 *
 * The rule here: change every client-writable field and no signed byte moves.
 * Change one run field and they do. The owner's statements land in one file the
 * manifest names as attested, and that file alone.
 */

const run = {
  runId: 'run-1',
  projectId: 'proj-1',
  userId: 'u-1',
  createdAt: '2026-09-16T08:00:00.000Z',
  status: 'completed',
  inputFingerprint: { sha256: 'a'.repeat(64), fileName: 'zcl_order.abap', lineCount: 120, byteSize: 4096, objectType: 'Class' },
  analyzerVersion: '2.10.8',
  rulesetVersion: 'rules-v1.0',
  sapApiCatalogVersion: '2026.09',
  model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', engineVersion: '2.10.8', byokUsed: false },
  extensibilityRoute: 'rap',
  cleanCoreScore: 71,
  complexityScore: 40,
  criticalityScore: 55,
  evidenceReport: [],
  dataCoupling: [{ table: 'VBAK', accessType: 'read', lineNumber: 12 }],
  codeInventory: [],
  worklist: [{ id: 'finding-x-0', title: 'Direct read on VBAK', category: 'Finding', severity: 'High', location: 'zcl_order.abap:12', recommendation: 'Use I_SalesDocument', status: 'open', effort: 'Medium' }],
  originalRecommendation: 'rap',
  recommendationConfidence: 82,
  recommendationJustification: 'Released CDS views cover every read.',
  runHash: 'b'.repeat(64),
  signature: 'c'.repeat(64),
};

const auditMetadata = {
  inputFingerprint: { ...run.inputFingerprint, uploadedAt: '2026-09-16T08:00:00.000Z' },
  modelCard: { provider: 'google-gemini', model: 'gemini-3-flash-preview', engineVersion: '2.10.8', catalogVersion: '2026.09', byokUsed: false, analysisTimestamp: '2026-09-16T08:00:00.000Z' },
};

// Every field the owner's own statements put on the project document, each with
// a value that would be worth forging. Most are still written from the browser
// (firestore.rules, update allowlist); the five release fields went behind
// POST /api/projects/{id}/commands in roadmap 0.7 and are recorded on the
// owner's behalf. Either way they are the owner's claim, not the engine's, so
// either way no signed byte may move when they change.
const honest = {
  name: 'Order intake',
  status: 'analyzed',
  targetArchitecture: 'rap',
  approvedByArchitect: false,
  approvedBy: '',
  architectSignOffAt: undefined,
  architectJustifiedOverride: '',
  solutionDesign: '{}',
  generatedCode: '[]',
  documentation: '',
  presentation: '',
  worklist: [],
  extensibilityRoute: 'rap',
  legacyCode: 'REPORT z.',
};
const forged = {
  name: 'Approved by the board',
  status: 'completed',
  targetArchitecture: 'retire',
  approvedByArchitect: true,
  approvedBy: 'cto@example.com',
  architectSignOffAt: '2026-09-16T09:00:00.000Z',
  architectJustifiedOverride: 'Nothing to migrate, decommission.',
  solutionDesign: '{"everything":"fine"}',
  generatedCode: '[{"path":"done.abap"}]',
  documentation: 'All tests passed.',
  presentation: 'Go-live approved.',
  worklist: [{ id: 'finding-x-0', title: 'Direct read on VBAK', status: 'signed_off', level: 'fully' }],
  extensibilityRoute: 'retire',
  legacyCode: 'REPORT z2.',
};

// The generators stamp their own generation time; two builds a millisecond
// apart differ in exactly that and nothing else.
const stable = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<ts>');

function build(projectData: Record<string, unknown>) {
  return buildAuditPackContents({
    projectId: 'proj-1',
    runId: 'run-1',
    run: { ...run, worklist: run.worklist },
    auditMetadata,
    attested: attestationsOf(projectData),
  });
}

test('changing every client-writable field changes no signed byte', () => {
  const a = build(honest);
  const b = build(forged);
  expect(Object.keys(a.signed).sort()).toEqual(Object.keys(b.signed).sort());
  for (const path of Object.keys(a.signed)) {
    expect(stable(b.signed[path]), `${path} moved with a client-writable field`).toBe(stable(a.signed[path]));
  }
});

test('the forged statements appear in the attested file and nowhere else', () => {
  const { signed, attested } = build(forged);
  const everythingSigned = Object.values(signed).join('\n');
  for (const needle of ['Approved by the board', 'cto@example.com', 'Nothing to migrate', 'Go-live approved', 'All tests passed', 'Retire / Decommission']) {
    expect(everythingSigned, `"${needle}" reached a signed file`).not.toContain(needle);
  }
  expect(Object.keys(attested)).toEqual([USER_ATTESTED_FILE]);
  const statement = attested[USER_ATTESTED_FILE];
  expect(statement).toContain('Approved by the board');
  expect(statement).toContain('cto@example.com');
  expect(statement).toContain('Retire / Decommission');
  expect(statement).toContain('overrides the engine');
  expect(statement).toContain('not covered by the pack');
});

test('a changed run field does change the signed files — the check above is not vacuous', () => {
  const a = build(honest);
  const b = buildAuditPackContents({
    projectId: 'proj-1',
    runId: 'run-1',
    run: { ...run, cleanCoreScore: 12, worklist: [] },
    auditMetadata,
    attested: attestationsOf(honest),
  });
  expect(stable(b.signed['00-executive-summary.md'])).not.toBe(stable(a.signed['00-executive-summary.md']));
  expect(stable(b.signed['06-architecture-decision-record.md'])).not.toBe(stable(a.signed['06-architecture-decision-record.md']));
});

test('the signed generators never see a project field, even one that is not on the allowlist', () => {
  const input = signedGeneratorInput({
    projectId: 'proj-1',
    runId: 'run-1',
    run: { ...run, solutionDesign: 'smuggled on the run', targetArchitecture: 'cap' },
    auditMetadata,
    attested: {},
  }) as unknown as Record<string, unknown>;
  // Named run fields come through; anything else on the run object does not —
  // a spread would have carried both.
  expect(input.cleanCoreScore).toBe(71);
  expect(input.worklist).toEqual(run.worklist);
  expect(input.solutionDesign).toBeUndefined();
  expect(input.targetArchitecture).toBeUndefined();
  expect(input.approvedByArchitect).toBeUndefined();
  expect(input.name).toBeUndefined();
});

test('the signed files point at the attested file instead of restating it', () => {
  const { signed } = build(forged);
  expect(signed['00-executive-summary.md']).toContain(USER_ATTESTED_FILE);
  expect(signed['06-architecture-decision-record.md']).toContain(USER_ATTESTED_FILE);
  const record = JSON.parse(signed['02-decision-record.json']);
  expect(record.architectReview).toEqual({ attestationType: 'self-attested', recordedIn: USER_ATTESTED_FILE, signed: false });
  expect(record.recommendation.engineRecommendation).toBe('rap');
  expect(record.recommendation.targetArchitecture).toBeUndefined();
  // Since 17.09.2026 the manifest binds the attested file's bytes as well as its
  // name, so the provenance table says what the digest does and does not buy:
  // the statement was not rewritten after sealing, and nobody vouches for it.
  expect(signed['00-provenance.md']).toContain(`${USER_ATTESTED_FILE} | **user-attested — nobody vouches for what it says.**`);
  expect(signed['00-provenance.md']).toContain('it does not make the statement in it true');
});

test.describe('the canonical manifest', () => {
  const files = [
    { path: '01-input-fingerprint.json', sha256: '1'.repeat(64) },
    { path: '00-executive-summary.md', sha256: '0'.repeat(64) },
  ];
  const bound = { projectId: 'p', runId: 'r', runHash: 'h', engineVersion: 'v', sapApiCatalogVersion: 'c' };

  test('without attested files it is byte-for-byte the v1.18.1 form', () => {
    expect(canonicalAuditManifest({ files, ...bound })).toBe(
      `00-executive-summary.md:${'0'.repeat(64)};01-input-fingerprint.json:${'1'.repeat(64)};p:r:h:v:c;`,
    );
    expect(canonicalAuditManifest({ files, ...bound, attested: [] })).toBe(canonicalAuditManifest({ files, ...bound }));
  });

  test('a pack older than the run binding still canonicalises without the suffix', () => {
    expect(canonicalAuditManifest({ files })).toBe(`00-executive-summary.md:${'0'.repeat(64)};01-input-fingerprint.json:${'1'.repeat(64)};`);
  });

  test('attested paths are bound by name, sorted, after the run suffix', () => {
    const c = canonicalAuditManifest({ files, ...bound, attested: [{ path: 'zz.md' }, { path: USER_ATTESTED_FILE }] });
    expect(c.endsWith(`p:r:h:v:c;attested=${USER_ATTESTED_FILE},zz.md;`)).toBe(true);
    // Adding an attested path changes the hash input — nobody can slip a
    // second "attested" file into a sealed pack.
    expect(c).not.toBe(canonicalAuditManifest({ files, ...bound, attested: [{ path: USER_ATTESTED_FILE }] }));
  });
});

test.describe('the run route keeps the narrative out of the signed worklist', () => {
  test('gaps from the analysis narrative go to the project worklist only', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'runs', 'create', 'route.ts'), 'utf8');
    const payload = src.slice(src.indexOf('const unsignedRunPayload'), src.indexOf('const canonicalPayloadStr'));
    expect(payload).toMatch(/worklist:\s*signedWorklist\b/);
    expect(payload, 'narrative gaps reached the signed payload').not.toMatch(/gapsList|narrativeGapItems|Functional Gap/);
    const signedBlock = src.slice(src.indexOf('const signedWorklist'), src.indexOf('const narrativeGapItems'));
    expect(signedBlock, 'the signed worklist maps client-supplied gaps').not.toMatch(/gapsList/);
    expect(src).toMatch(/worklist:\s*\[\.\.\.signedWorklist,\s*\.\.\.narrativeGapItems\]/);
  });
});
