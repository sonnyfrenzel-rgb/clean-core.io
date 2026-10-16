import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import type { Project } from '../lib/types';
import { sha256Hex } from '../lib/artefact-digest';
import { coveringTestRunReceipt, testRunSubject, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '../lib/test-receipt';
import { packageDigest, testedPackageMoved, testSuiteBasisOf, PREVIOUS_PACKAGE } from '../lib/test-suite-basis';
import { handoverBlockers, staleness, testingClosureBasis, testsPreviousBasis, workflowSteps, phaseActionLabel } from '../lib/workflow-steps';
import { withStoredArtefacts } from '../lib/project-artefact-store';
import { storeDocumentation, storeTestSuite } from '../lib/project-artefact-writes';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocumentation } from '../lib/process-documentation-build';

/**
 * Owner request 16.10.2026, testing v3.0.14 on dev with the SD example: "wenn
 * ich eine neue Transformation mache muss Testing 'out of date' werden, oder?"
 *
 * The suite is stored with the digest of the package it was written for
 * (`testSuiteBasis`, `lib/test-suite-basis.ts`); a new Transformation replaces
 * the package and Testing reads stale — rail, delivery, closure. A suite
 * stored before the record existed is not turned stale by a deploy.
 *
 *   1. the phase contract, pure;
 *   2. the store, against the Firestore emulator (Admin SDK, no server);
 *   3. source guards: the hook names the package it wrote for.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PACKAGE_A = JSON.stringify([
  { path: 'src/zcl_sd_price.clas.abap', content: 'CLASS zcl_sd_price DEFINITION PUBLIC. ENDCLASS.' },
  { path: 'src/zcl_sd_price.clas.testclasses.abap', content: '' },
]);
const PACKAGE_B = JSON.stringify([
  { path: 'src/zcl_sd_price.clas.abap', content: 'CLASS zcl_sd_price DEFINITION PUBLIC FINAL. ENDCLASS.' },
  { path: 'src/zcl_sd_price.clas.testclasses.abap', content: '' },
]);
const CASES = Array.from({ length: 4 }, (_, i) => ({ id: `TC_0${i + 1}`, name: `Case ${i + 1}` }));

/** An ABAP Cloud project with a suite written for package A — no runner here, so closing it is otherwise possible. */
function project(extra: Partial<Project> & Record<string, unknown> = {}): Project {
  return {
    id: 'p1',
    name: 'SD pricing',
    userId: 'owner',
    legacyCode: 'REPORT z_sd_price.\nWRITE 1.',
    activeRunId: 'run-1',
    extensibilityRoute: 'Developer Extensibility (ABAP Cloud)',
    solutionDesign: 'design',
    approvedByArchitect: true,
    generatedCode: PACKAGE_A,
    documentation: 'docs',
    testSuite: { code: 'CLASS ltcl_test DEFINITION FOR TESTING. ENDCLASS.' },
    testCases: CASES,
    testSuiteBasis: { codeSha256: sha256Hex(PACKAGE_A), recordedAt: '2026-10-16T08:00:00.000Z' },
    ...extra,
  } as unknown as Project;
}

const testing = (p: Project) => workflowSteps(p).find((s) => s.key === 'testing')!;
const delivery = (p: Project) => workflowSteps(p).find((s) => s.key === 'delivery')!;

test.describe('a new Transformation makes Testing out of date', () => {
  test('a suite written for the package on the project is current', () => {
    const p = project();
    expect(testedPackageMoved(p)).toBe(false);
    expect(staleness(p).tests).toBe(false);
    expect(testing(p).state).not.toBe('stale');
  });

  test('regenerating the package makes Testing stale, said as a previous generated package', () => {
    const p = project({ generatedCode: PACKAGE_B });
    const s = staleness(p);
    expect(s.tests).toBe(true);
    expect(s.testsPackage).toBe(true);
    // Nothing upstream moved: the source, the design and the code are current.
    expect(s.sourceChanged).toBe(false);
    expect(s.design).toBe(false);
    expect(s.code).toBe(false);

    const step = testing(p);
    expect(step.state).toBe('stale');
    expect(step.detail).toBe(`Test cases written for ${PREVIOUS_PACKAGE} — regenerate the suite.`);
    expect(phaseActionLabel(step, true)).toBe('Bring Testing up to date');
    expect(testsPreviousBasis(p)).toBe(PREVIOUS_PACKAGE);

    expect(handoverBlockers(p)).toEqual([`the test suite (written for ${PREVIOUS_PACKAGE})`]);
    const d = delivery(p);
    expect(d.state).toBe('stale');
    expect(d.detail).toBe(`Handover blocked — the test suite was written for ${PREVIOUS_PACKAGE}. Regenerate it in Testing.`);
  });

  test('a package that is gone counts as moved too', () => {
    // No package is no package to test against; the testing step then reads stale, not current.
    expect(testedPackageMoved(project({ generatedCode: '' }))).toBe(true);
  });

  test('a package kept beside the project that this reader did not join is unknown, not moved', () => {
    const bare = project({ generatedCode: undefined, artefactStore: { generatedCode: { rev: 'r1', parts: 1, kind: 'string', bytes: 10 } } });
    expect(testedPackageMoved(bare)).toBe(false);
    expect(testedPackageMoved(project({ generatedCode: undefined, _artefactsUnread: true }))).toBe(false);
  });

  test('a suite stored before the record existed is not stale for a package change', () => {
    for (const basis of [undefined, null, { codeSha256: 'not-a-digest' }]) {
      const p = project({ generatedCode: PACKAGE_B, testSuiteBasis: basis as never });
      expect(testSuiteBasisOf(p)).toBeNull();
      expect(staleness(p).tests, JSON.stringify(basis)).toBe(false);
      expect(testing(p).state).not.toBe('stale');
      expect(handoverBlockers(p)).toEqual([]);
    }
  });

  test('a source change is still said as a source change', () => {
    const p = project({ generatedCode: PACKAGE_B, legacyCode: 'REPORT z_other.', auditMetadata: { inputFingerprint: { sha256: sha256Hex('REPORT z_sd_price.\nWRITE 1.') } } as never });
    const s = staleness(p);
    expect(s.sourceChanged).toBe(true);
    expect(s.tests).toBe(true);
    expect(s.testsPackage).toBe(false);
    expect(testsPreviousBasis(p)).toBe('a previous source');
  });

  test('closing Testing is refused while the suite was written for a previous package', () => {
    // Current suite on the ABAP Unit route: no runner here, so closing is offered.
    const current = testingClosureBasis(project());
    expect(current.ok).toBe(true);
    const moved = testingClosureBasis(project({ generatedCode: PACKAGE_B }));
    expect(moved).toEqual({ ok: false, code: 'suite-stale', error: `The test suite was written for ${PREVIOUS_PACKAGE}. Regenerate it first.` });
    // Without a record the closure stays what it was.
    expect(testingClosureBasis(project({ generatedCode: PACKAGE_B, testSuiteBasis: undefined })).ok).toBe(true);
  });

  test('a recorded test run stops covering a regenerated package', () => {
    const p = project({ extensibilityRoute: 'Side-by-Side (SAP BTP)' });
    const s = testRunSubject(p as Parameters<typeof testRunSubject>[0]);
    const receipt: TestRunReceipt = {
      v: TEST_RUN_RECEIPT_VERSION,
      runId: s.runId, codeDigest: s.codeDigest, suiteDigest: s.suiteDigest, casesDigest: s.casesDigest,
      environment: 'mock', scope: { selected: null, cases: CASES.length }, stubs: [],
      executedAt: '2026-10-16T09:00:00.000Z', executedBy: 'owner', exitCode: 0,
      verdicts: CASES.map((c) => ({ id: c.id, status: 'Passed' })),
    };
    expect(coveringTestRunReceipt({ ...p, testRunReceipt: receipt } as never)).not.toBeNull();
    const after = { ...p, generatedCode: PACKAGE_B, testRunReceipt: receipt } as unknown as Project;
    expect(coveringTestRunReceipt(after as never)).toBeNull();
    // ...and the phase does not read done on that receipt: it reads stale.
    expect(testing(after).state).toBe('stale');
  });
});

/* ------------------------------------------------ 2. against the emulator */

const db = (): Firestore => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

const SOURCE = 'REPORT z_sd_price.\n';

async function seed(data: Record<string, unknown>) {
  const ref = db().collection('projects').doc(`suite-basis-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  await ref.set(data);
  return ref;
}

test.describe('the store records the package the suite was written for', () => {
  test.describe.configure({ mode: 'serial' });
  const body = { testCases: CASES, testSuite: { code: 'c' }, coverageEstimate: { percentage: 50 }, manualTestingRequirements: [] };

  test('written for the package on record: stored with its digest; a moved package is refused', async () => {
    const ref = await seed({ userId: 'owner', name: 'SD', status: 'transformed', activeRunId: 'run-1', legacyCode: SOURCE, generatedCode: PACKAGE_A });
    const ok = await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body: { ...body, generatedCodeSha256: packageDigest(PACKAGE_A) } });
    expect(ok.status).toBe(200);
    const stored = await withStoredArtefacts(db(), ref, ((await ref.get()).data() || {}) as Record<string, unknown>);
    expect(testSuiteBasisOf(stored)?.codeSha256).toBe(sha256Hex(PACKAGE_A));
    expect(staleness(stored as unknown as Project).tests).toBe(false);

    // A new Transformation stored meanwhile: the suite was written for the previous package.
    const moved = await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body: { ...body, generatedCodeSha256: packageDigest(PACKAGE_B) } });
    expect(moved).toMatchObject({ status: 409, code: 'package-moved' });
    expect(await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body: { ...body, generatedCodeSha256: 'abc' } })).toMatchObject({ status: 400 });

    // The package is replaced (what /api/projects/{id}/contract writes): Testing reads stale.
    await ref.update({ generatedCode: PACKAGE_B });
    const after = await withStoredArtefacts(db(), ref, ((await ref.get()).data() || {}) as Record<string, unknown>);
    expect(staleness(after as unknown as Project).testsPackage).toBe(true);
  });

  test('a page from before the record stores the suite without one, and an older record goes with it', async () => {
    const ref = await seed({
      userId: 'owner', name: 'SD', status: 'testing', activeRunId: 'run-1', legacyCode: SOURCE, generatedCode: PACKAGE_B,
      testSuiteBasis: { codeSha256: sha256Hex(PACKAGE_A), recordedAt: '2026-10-16T08:00:00.000Z' },
    });
    expect((await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body })).status).toBe(200);
    const stored = ((await ref.get()).data() || {}) as Record<string, unknown>;
    expect(stored.testSuiteBasis).toBeNull();
    expect(staleness({ ...stored, testCases: CASES } as unknown as Project).tests).toBe(false);
  });

  test('a Documentation write that takes old documentation files out of the package keeps the suite current', async () => {
    const SRC = 'REPORT z_style.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
    const bpmn = buildBpmnExportFromSource(SRC, { processName: 'z_style.abap', sourceFileName: 'z_style.abap' });
    const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(SRC), null), fileName: 'z_style.abap' });
    const documentation = JSON.stringify(buildProcessDocumentation({ source: SRC, map }));
    const withDocs = JSON.stringify([...JSON.parse(PACKAGE_A), { path: 'docs/process-documentation.md', content: '# old' }]);
    const ref = await seed({
      userId: 'owner', name: 'SD', status: 'testing', activeRunId: 'run-1', legacyCode: SRC, generatedCode: withDocs,
      testCases: CASES, testSuiteBasis: { codeSha256: sha256Hex(withDocs), recordedAt: '2026-10-16T08:00:00.000Z' },
    });
    const out = await storeDocumentation(db(), { projectId: ref.id, uid: 'owner', body: { documentation, fromRunId: 'run-1', sourceSha256: sha256Hex(SRC) } });
    expect(out.status).toBe(200);
    const after = await withStoredArtefacts(db(), ref, ((await ref.get()).data() || {}) as Record<string, unknown>);
    expect(after.generatedCode).toBe(PACKAGE_A);
    expect(testSuiteBasisOf(after)?.codeSha256).toBe(sha256Hex(PACKAGE_A));
    expect(staleness(after as unknown as Project).tests).toBe(false);
  });
});

/* ------------------------------------------------------ 3. source guards */

test.describe('the hook names the package it wrote the suite for', () => {
  test('useTestGeneration sends the digest of the package it built the prompt from, and keeps the record', () => {
    const hook = read('hooks/useTestGeneration.ts');
    expect(hook).toContain('const testedPackage = packageDigest(project?.generatedCode);');
    expect(hook).toContain('generatedCodeSha256: testedPackage,');
    expect(hook).toContain('testSuiteBasis } : prev');
  });

  test('the record is the server\'s: not on the client update allowlist of firestore.rules', () => {
    expect(read('firestore.rules')).not.toContain('testSuiteBasis');
  });
});
