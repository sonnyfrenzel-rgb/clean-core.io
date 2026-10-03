import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { adminGetDoc, adminMergeDoc } from './helpers/admin-seed';
import { seedStageProject, type SeededProject } from './helpers/seed-project';
import { connectAuthToEmulator, connectFirestoreToEmulator } from './helpers/emulator-guard';
import {
  MAX_RESULT_FILE_BYTES,
  MAX_RESULT_NAME_CHARS,
  MAX_RESULT_TESTCASES,
  matchToScenarios,
  parseTestResultFile,
} from '../lib/test-result-import';
import {
  outsideReading,
  outsideSubjectOf,
  validateConfirmation,
  type OutsideTestSummary,
} from '../lib/sap-test-results';
import { phaseTone, workflowSteps, type RailStep } from '../lib/workflow-steps';
import {
  buildHandoverChain,
  handoverNextStep,
  handoverStillNeeded,
  type HandoverProject,
} from '../lib/handover';
import { workspaceStatusLine } from '../lib/workspace-model';
import type { Project } from '../lib/types';

/**
 * ADR-075 — test results from the reader's own SAP system (owner decision
 * 03.10.2026: "both" — an imported ABAP Unit result file, or the account's
 * confirmation without one).
 *
 * Three halves, in the order the decision depends on them:
 *
 *   1. **The reader of the file** (`lib/test-result-import.ts`) — what it
 *      accepts, and what it refuses before it reads a value: a DTD, an entity
 *      declaration (XXE, billion laughs), an oversized file, too many test
 *      cases. Owner, same day: "the upload must not create a new security hole".
 *   2. **The phase and the handover** — an import with no failure and every
 *      scenario passed makes Testing `done` with `verifiedOutside: 'imported'`;
 *      a confirmation with no failure does so as `confirmed`; neither is ever
 *      `proven` or green; a result recorded for an earlier suite counts for
 *      nothing.
 *   3. **The route** — owner write, member read, uniform 404, validation, and
 *      the record a browser cannot write.
 */

/* ------------------------------------------------------------------ fixtures */

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="ABAP Unit" tests="4" failures="1">
  <testsuite name="ZCL_EXPENSE" tests="4" failures="1" skipped="1">
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="TC_01_ACCEPT_VALID" time="0.01"/>
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="TC_02_REJECT_OVER_LIMIT" time="0.01">
      <failure message="Expected rejection, got approval" type="CX_AUNIT_FAILURE">Stack: LTCL_EXPENSE->TC_02 line 42</failure>
    </testcase>
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="TC_10_ROUNDING">
      <skipped/>
    </testcase>
    <testcase classname="ZCL_EXPENSE.LTCL_EXPENSE" name="SETUP_HELPER_CHECK"/>
  </testsuite>
</testsuites>`;

/** ADT's own ABAP Unit run result, as `/sap/bc/adt/abapunit/testruns` answers by default. */
const AUNIT = `<?xml version="1.0" encoding="utf-8"?>
<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">
  <program adtcore:uri="/sap/bc/adt/oo/classes/zcl_expense" adtcore:type="CLAS/OC" adtcore:name="ZCL_EXPENSE">
    <testClasses>
      <testClass adtcore:name="LTCL_EXPENSE" riskLevel="harmless" durationCategory="short">
        <testMethods>
          <testMethod adtcore:name="TC_01_ACCEPT_VALID" executionTime="0.001"/>
          <testMethod adtcore:name="TC_02_REJECT_OVER_LIMIT" executionTime="0.002">
            <alerts>
              <alert kind="failedAssertion" severity="critical">
                <title>Critical Assertion Error: 'Expected rejection'</title>
                <details><detail text="Expected [X] Actual [ ]"/></details>
              </alert>
            </alerts>
          </testMethod>
          <testMethod adtcore:name="TC_03_WARN_ONLY">
            <alerts><alert kind="warning" severity="tolerable"><title>Slow</title></alert></alerts>
          </testMethod>
        </testMethods>
      </testClass>
    </testClasses>
  </program>
</aunit:runResult>`;

const passingJunit = (ids: string[]) =>
  `<testsuite name="ZCL">${ids.map((id) => `<testcase classname="ZCL.LTCL" name="${id}_CASE"/>`).join('')}</testsuite>`;

/* --------------------------------------------------------- 1. the reader */

test.describe('reading an ABAP Unit result file', () => {
  test('JUnit XML: passes, a failure with its message, a skip, and the class', () => {
    const r = parseTestResultFile(JUNIT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe('junit');
    expect(r.cases.map((c) => [c.name, c.outcome])).toEqual([
      ['TC_01_ACCEPT_VALID', 'passed'],
      ['TC_02_REJECT_OVER_LIMIT', 'failed'],
      ['TC_10_ROUNDING', 'skipped'],
      ['SETUP_HELPER_CHECK', 'passed'],
    ]);
    expect(r.cases[1].message).toBe('Expected rejection, got approval');
    expect(r.cases[0].className).toBe('ZCL_EXPENSE.LTCL_EXPENSE');
    expect(r.cases[0].message).toBeNull();
  });

  test('an <error> is a failure, and its text is the message when there is no attribute', () => {
    const r = parseTestResultFile('<testsuite><testcase name="TC_01"><error>CX_SY_ZERODIVIDE raised\n at line 12</error></testcase></testsuite>');
    expect(r.ok && r.cases[0]).toMatchObject({ outcome: 'failed', message: 'CX_SY_ZERODIVIDE raised at line 12' });
  });

  test("ADT's ABAP Unit run result: a critical alert fails a method, a tolerable one does not", () => {
    const r = parseTestResultFile(AUNIT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe('aunit');
    expect(r.cases.map((c) => [c.name, c.className, c.outcome])).toEqual([
      ['TC_01_ACCEPT_VALID', 'LTCL_EXPENSE', 'passed'],
      ['TC_02_REJECT_OVER_LIMIT', 'LTCL_EXPENSE', 'failed'],
      ['TC_03_WARN_ONLY', 'LTCL_EXPENSE', 'passed'],
    ]);
    expect(r.cases[1].message).toBe("Critical Assertion Error: 'Expected rejection'");
  });

  test('a method gives a scenario its result by the Testing stage’s rule — TC_1 never takes TC_10', () => {
    const r = parseTestResultFile(JUNIT);
    if (!r.ok) throw new Error(r.error);
    const m = matchToScenarios(r.cases, ['TC_01', 'TC_02', 'TC_1', 'TC_10', 'TC_04']);
    expect(m.results.map((x) => [x.id, x.outcome, x.tests])).toEqual([
      ['TC_01', 'passed', 1],
      ['TC_02', 'failed', 1],
      // `TC_1` is not a prefix of `TC_10`, and `TC_01` is a different id.
      ['TC_1', 'none', 0],
      ['TC_10', 'skipped', 1],
      ['TC_04', 'none', 0],
    ]);
    expect(m.results[1].message).toBe('Expected rejection, got approval');
    // The helper is not one of the scenarios, and says so.
    expect(m.unmatched).toEqual([{ name: 'SETUP_HELPER_CHECK', outcome: 'passed' }]);
    expect(m.unmatchedTotal).toBe(1);
    expect(m.totals).toEqual({ tests: 4, passed: 2, failed: 1, skipped: 1 });
  });

  test('a writer that puts CLASS=>METHOD into the name is read by its method', () => {
    const r = parseTestResultFile('<testsuite><testcase name="LTCL_X=>TC_07_EDGE"/><testcase name="LTCL_X->tc_08"/></testsuite>');
    if (!r.ok) throw new Error(r.error);
    const m = matchToScenarios(r.cases, ['TC_07', 'TC_08']);
    expect(m.results.map((x) => x.outcome)).toEqual(['passed', 'passed']);
  });

  test('XXE: a DOCTYPE with an external entity is refused before anything is read', () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE testsuite [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<testsuite><testcase name="&xxe;"/></testsuite>`;
    expect(parseTestResultFile(xxe)).toMatchObject({ ok: false, code: 'dtd-refused' });
    const remote = '<!DOCTYPE testsuite SYSTEM "http://169.254.169.254/latest/meta-data/"><testsuite/>';
    expect(parseTestResultFile(remote)).toMatchObject({ ok: false, code: 'dtd-refused' });
  });

  test('billion laughs: nested entity declarations are refused at once, not expanded', () => {
    const levels = Array.from({ length: 10 }, (_, i) =>
      i === 0 ? '<!ENTITY lol0 "lol">' : `<!ENTITY lol${i} "${`&lol${i - 1};`.repeat(10)}">`,
    ).join('\n');
    const bomb = `<?xml version="1.0"?>\n<!DOCTYPE lolz [\n${levels}\n]>\n<testsuite><testcase name="&lol9;"/></testsuite>`;
    const started = Date.now();
    expect(parseTestResultFile(bomb)).toMatchObject({ ok: false, code: 'dtd-refused' });
    expect(Date.now() - started).toBeLessThan(100);
  });

  test('an entity nobody declared is not expanded — it stays the literal text', () => {
    const r = parseTestResultFile('<testsuite><testcase name="TC_01 &xxe; &amp; &#x41;&#66;"/></testsuite>');
    expect(r.ok && r.cases[0].name).toBe('TC_01 &xxe; & AB');
  });

  test('an oversized file is refused', () => {
    const big = `<testsuite>${'<testcase name="x"/>'.repeat(Math.ceil(MAX_RESULT_FILE_BYTES / 20) + 10)}</testsuite>`;
    expect(new TextEncoder().encode(big).length).toBeGreaterThan(MAX_RESULT_FILE_BYTES);
    expect(parseTestResultFile(big)).toMatchObject({ ok: false, code: 'too-large' });
  });

  test('too many test cases are refused', () => {
    const many = `<testsuite>${'<testcase name="T"/>'.repeat(MAX_RESULT_TESTCASES + 1)}</testsuite>`;
    expect(parseTestResultFile(many)).toMatchObject({ ok: false, code: 'too-many-tests' });
  });

  test('every kept string is cut, and control and bidi characters are dropped', () => {
    const long = 'TC_01_' + 'A'.repeat(5000);
    const r = parseTestResultFile(
      `<testsuite><testcase name="${long}"/><testcase name="TC_02&#x202E;gpj.exe&#x7;"><failure message="${'m'.repeat(5000)}"/></testcase></testsuite>`,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.cases[0].name.length).toBe(MAX_RESULT_NAME_CHARS);
    expect(r.cases[0].name.endsWith('…')).toBe(true);
    expect(r.cases[1].name).toBe('TC_02gpj.exe');
    expect(r.cases[1].message!.length).toBeLessThanOrEqual(300);
  });

  test('markup in a name is kept as text, never interpreted', () => {
    const r = parseTestResultFile('<testsuite><testcase name="TC_01 &lt;img src=x onerror=alert(1)&gt;"/></testsuite>');
    expect(r.ok && r.cases[0].name).toBe('TC_01 <img src=x onerror=alert(1)>');
  });

  test('what is not a result file is refused with a reason', () => {
    expect(parseTestResultFile('')).toMatchObject({ ok: false, code: 'empty' });
    expect(parseTestResultFile('<html><body/></html>')).toMatchObject({ ok: false, code: 'unknown-format' });
    expect(parseTestResultFile('<testsuite><testcase name="a"></testsuite>')).toMatchObject({ ok: false, code: 'not-xml' });
    expect(parseTestResultFile('<testsuite></testsuite>')).toMatchObject({ ok: false, code: 'no-tests' });
    expect(parseTestResultFile('just text')).toMatchObject({ ok: false, code: 'not-xml' });
    const deep = `<testsuite>${'<x>'.repeat(40)}${'</x>'.repeat(40)}</testsuite>`;
    expect(parseTestResultFile(deep)).toMatchObject({ ok: false, code: 'too-deep' });
  });
});

/* ------------------------------------------------- 2. phase and handover */

const SOURCE = 'REPORT z_expense.\nDATA lv_amount TYPE p.\n';

/** A project on the ABAP Cloud route with a signed run, code, a test class and two scenarios. */
function abapProject(extra: Record<string, unknown> = {}): Project {
  return {
    id: 'p-abap',
    name: 'Expense validation',
    userId: 'u',
    legacyCode: SOURCE,
    activeRunId: 'run-1',
    cleanCoreScore: 60,
    extensibilityRoute: 'ABAP Cloud (RAP)',
    solutionDesign: '# Target\n',
    approvedByArchitect: true,
    approvedBy: 'owner@example.com',
    generatedCode: 'CLASS zcl_expense DEFINITION. ENDCLASS.',
    documentation: '# Process\n',
    testSuite: { code: 'CLASS ltcl_expense DEFINITION FOR TESTING. ENDCLASS.' },
    testCases: [
      { id: 'TC_01', name: 'Accept a valid claim' },
      { id: 'TC_02', name: 'Reject over the limit' },
    ],
    ...extra,
  } as unknown as Project;
}

function imported(project: Project, over: Partial<OutsideTestSummary> = {}): OutsideTestSummary {
  return {
    v: 1,
    kind: 'imported',
    subject: outsideSubjectOf(project),
    recordedAt: '2026-10-03T10:00:00.000Z',
    recordedBy: 'owner@example.com',
    scenarioCount: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    coverage: { passed: 2, failed: 0, skipped: 0, none: 0 },
    file: { name: 'aunit.xml', sha256: 'a'.repeat(64), format: 'junit' },
    system: null,
    ranOn: null,
    ...over,
  };
}

function confirmed(project: Project, over: Partial<OutsideTestSummary> = {}): OutsideTestSummary {
  return {
    v: 1,
    kind: 'confirmed',
    subject: outsideSubjectOf(project),
    recordedAt: '2026-10-03T10:00:00.000Z',
    recordedBy: 'owner@example.com',
    scenarioCount: 2,
    passed: 12,
    failed: 0,
    skipped: 0,
    coverage: null,
    file: null,
    system: 'S4D / 100',
    ranOn: '2026-10-02',
    ...over,
  };
}

const step = (steps: RailStep[], key: RailStep['key']) => steps.find((s) => s.key === key)!;
const withResult = (summary: (p: Project) => OutsideTestSummary, extra: Record<string, unknown> = {}) => {
  const base = abapProject(extra);
  return { ...base, outsideTestResult: summary(base) } as Project;
};

test.describe('the phase and the handover', () => {
  test('without a result the ABAP Unit suite is a draft, and the handover asks for a run', () => {
    const steps = workflowSteps(abapProject());
    expect(step(steps, 'testing')).toMatchObject({ state: 'partial', badge: 'Test draft', proven: false, verifiedOutside: null });
    expect(step(steps, 'delivery').done).toBe(false);
  });

  test('an import with no failure and every scenario passed: done, imported, never proven or green', () => {
    const project = withResult((p) => imported(p));
    const steps = workflowSteps(project);
    const testing = step(steps, 'testing');
    expect(testing).toMatchObject({ state: 'done', proven: false, mock: false, verifiedOutside: 'imported', badge: 'Imported · passed' });
    expect(phaseTone(testing)).toBe('unproven');
    const delivery = step(steps, 'delivery');
    expect(delivery).toMatchObject({ state: 'done', proven: false, verifiedOutside: 'imported', badge: 'Ready · imported tests' });

    const hp = project as HandoverProject;
    const chain = buildHandoverChain(hp, steps);
    const tests = chain.find((l) => l.key === 'tests')!;
    expect(tests).toMatchObject({ state: 'on-record', provenance: 'imported', provenanceNote: 'from your system' });
    expect(tests.value).toContain('2 of 2 scenarios passed');
    const needed = handoverStillNeeded(hp, chain, { blockers: [], exportedAt: null });
    expect(needed.find((n) => n.key === 'tests'), 'the handover still asks for tests').toBeUndefined();
    const next = handoverNextStep(hp, steps, [], chain, 'p-abap');
    expect(next.headline).not.toBe('Run the test suite');
  });

  test('an import with a failure is not green and does not complete the handover', () => {
    const project = withResult((p) => imported(p, { passed: 1, failed: 1, coverage: { passed: 1, failed: 1, skipped: 0, none: 0 } }));
    const steps = workflowSteps(project);
    expect(step(steps, 'testing')).toMatchObject({ state: 'partial', verifiedOutside: null, badge: 'Failures · your system' });
    expect(step(steps, 'delivery').done).toBe(false);
    const hp = project as HandoverProject;
    const chain = buildHandoverChain(hp, steps);
    const needed = handoverStillNeeded(hp, chain, { blockers: [], exportedAt: null });
    expect(needed.find((n) => n.key === 'tests')?.text).toContain('Passing tests from your SAP system');
    expect(handoverNextStep(hp, steps, [], chain, 'p-abap').headline).toBe('Run the test suite');
  });

  test('a failure in a method that is not one of the scenarios still blocks', () => {
    const project = withResult((p) => imported(p, { passed: 2, failed: 1 }));
    expect(step(workflowSteps(project), 'testing').state).toBe('partial');
  });

  test('a scenario with no result in the file, or skipped, is not a pass', () => {
    const none = withResult((p) => imported(p, { passed: 1, coverage: { passed: 1, failed: 0, skipped: 0, none: 1 } }));
    expect(step(workflowSteps(none), 'testing')).toMatchObject({ state: 'partial', badge: 'Incomplete' });
    expect(step(workflowSteps(none), 'testing').detail).toContain('no result in the file');
    const skipped = withResult((p) => imported(p, { passed: 1, skipped: 1, coverage: { passed: 1, failed: 0, skipped: 1, none: 0 } }));
    expect(step(workflowSteps(skipped), 'testing').state).toBe('partial');
  });

  test('a confirmation with no failure: done, labelled confirmed — a self-declaration', () => {
    const project = withResult((p) => confirmed(p));
    const steps = workflowSteps(project);
    expect(step(steps, 'testing')).toMatchObject({ state: 'done', proven: false, verifiedOutside: 'confirmed', badge: 'Confirmed by you' });
    expect(step(steps, 'testing').detail).toContain('self-declaration');
    expect(step(steps, 'delivery')).toMatchObject({ state: 'done', proven: false, verifiedOutside: 'confirmed', badge: 'Ready · confirmed tests' });
    const tests = buildHandoverChain(project as HandoverProject, steps).find((l) => l.key === 'tests')!;
    expect(tests).toMatchObject({ provenance: 'confirmed', provenanceNote: 'by you · self-declaration' });
    expect(tests.value).toContain('S4D / 100');
    // The workspace's Execution facet: confirmed, in the information tone — never done.
    const execution = workspaceStatusLine(project).find((s) => s.facet === 'execution')!;
    expect(execution).toMatchObject({ status: 'confirmed', provenance: 'confirmed' });
  });

  test('a confirmation with a failure, or fewer passes than scenarios, does not turn the handover green', () => {
    const failing = withResult((p) => confirmed(p, { passed: 11, failed: 1 }));
    expect(step(workflowSteps(failing), 'testing')).toMatchObject({ state: 'partial', badge: 'Failures · your system' });
    expect(workspaceStatusLine(failing).find((s) => s.facet === 'execution')!.status).toBe('failed');
    const short = withResult((p) => confirmed(p, { passed: 1 }));
    expect(step(workflowSteps(short), 'testing')).toMatchObject({ state: 'partial', badge: 'Incomplete' });
  });

  test('stale: a result recorded before the suite, the scenarios, the code or the run changed counts for nothing', () => {
    const project = withResult((p) => imported(p));
    const moved: Array<[string, Record<string, unknown>]> = [
      ['the test class', { testSuite: { code: 'CLASS ltcl_expense DEFINITION FOR TESTING. "changed\nENDCLASS.' } }],
      ['the scenario list', { testCases: [{ id: 'TC_01', name: 'Accept a valid claim' }, { id: 'TC_02', name: 'Reject over the limit, renamed' }] }],
      ['the code', { generatedCode: 'CLASS zcl_expense DEFINITION. "v2\nENDCLASS.' }],
      ['the run', { activeRunId: 'run-2' }],
    ];
    for (const [what, change] of moved) {
      const after = { ...project, ...change } as Project;
      expect(outsideReading(after).state, what).toBe('earlier');
      const testing = step(workflowSteps(after), 'testing');
      expect(testing.state, what).toBe('partial');
      expect(testing.verifiedOutside, what).toBeNull();
      expect(testing.detail, what).toContain('earlier run, code, test class or scenario list');
    }
    // A verdict a browser writes onto a case is not a change of the case list.
    const annotated = { ...project, testCases: (project.testCases as unknown as Array<Record<string, unknown>>).map((t) => ({ ...t, status: 'Passed' })) } as Project;
    expect(outsideReading(annotated).state).toBe('current');
  });

  test('off the ABAP Cloud route a stored result is not read: the sandbox runs those scenarios', () => {
    const project = withResult((p) => imported(p), { extensibilityRoute: 'Side-by-Side (SAP BTP)' });
    expect(outsideReading(project).state).toBe('none');
    expect(step(workflowSteps(project), 'testing').verifiedOutside).toBeNull();
  });

  test('a stored summary of the wrong shape is ignored', () => {
    const base = abapProject();
    const forged = { ...base, outsideTestResult: { ...imported(base), v: 2 } } as unknown as Project;
    expect(outsideReading(forged).state).toBe('none');
    const noFile = { ...base, outsideTestResult: { ...imported(base), file: null } } as unknown as Project;
    expect(outsideReading(noFile).state).toBe('none');
  });
});

test.describe('the confirmation, validated', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  test('accepts counts, a system and a date; trims and bounds', () => {
    const r = validateConfirmation({ passed: 10, failed: 0, system: '  S4D /\t100 ', ranOn: '2026-10-02', note: ' ok ' }, now);
    expect(r).toEqual({ ok: true, value: { passed: 10, failed: 0, system: 'S4D / 100', ranOn: '2026-10-02', note: 'ok' } });
  });
  test('refuses what is not a result', () => {
    const bad: Array<Record<string, unknown>> = [
      { passed: -1, failed: 0, system: 'S', ranOn: '2026-10-02' },
      { passed: 1.5, failed: 0, system: 'S', ranOn: '2026-10-02' },
      { passed: '3', failed: 0, system: 'S', ranOn: '2026-10-02' },
      { passed: 0, failed: 0, system: 'S', ranOn: '2026-10-02' },
      { passed: 1, failed: 0, system: '', ranOn: '2026-10-02' },
      { passed: 1, failed: 0, system: 'S'.repeat(41), ranOn: '2026-10-02' },
      { passed: 1, failed: 0, system: 'S', ranOn: '02.10.2026' },
      { passed: 1, failed: 0, system: 'S', ranOn: '2026-02-30' },
      { passed: 1, failed: 0, system: 'S', ranOn: '2026-10-09' },
      { passed: 1, failed: 0, system: 'S', ranOn: '2026-10-02', note: 'n'.repeat(501) },
      { passed: 1, failed: 0, system: 'S', ranOn: '2026-10-02', note: 42 },
    ];
    for (const body of bad) expect(validateConfirmation(body, now).ok, JSON.stringify(body).slice(0, 80)).toBe(false);
  });
});

/* ------------------------------------------------------------- 3. the route */

test.describe('the route', () => {
  test.describe.configure({ mode: 'serial' });

  let owner: SeededProject & { token: string };
  let reader: SeededProject & { token: string };
  let stranger: SeededProject & { token: string };

  const tokenOfCurrent = async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]')!;
    return getAuth(app).currentUser!.getIdToken();
  };

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const o = await seedStageProject({ prefix: 'sapres-owner', acceptTerms: true });
    owner = { ...o, token: await tokenOfCurrent() };
    const r = await seedStageProject({ prefix: 'sapres-reader', acceptTerms: true });
    reader = { ...r, token: await tokenOfCurrent() };
    const s = await seedStageProject({ prefix: 'sapres-stranger', acceptTerms: true });
    stranger = { ...s, token: await tokenOfCurrent() };
    await adminMergeDoc('projects', owner.projectId, {
      extensibilityRoute: 'ABAP Cloud (RAP)',
      generatedCode: 'CLASS zcl_expense DEFINITION. ENDCLASS.',
      testSuite: { code: 'CLASS ltcl_expense DEFINITION FOR TESTING. ENDCLASS.' },
      testCases: [
        { id: 'TC_01', name: 'Accept a valid claim' },
        { id: 'TC_02', name: 'Reject over the limit' },
      ],
      readers: [reader.uid],
    });
  });

  const url = (id: string) => `/api/projects/${id}/test-results`;
  const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  test('no token: 401 on both verbs', async ({ request }) => {
    expect((await request.get(url(owner.projectId))).status()).toBe(401);
    expect((await request.post(url(owner.projectId), { data: { action: 'confirm' } })).status()).toBe(401);
  });

  test('a stranger gets the 404 of a project that does not exist, on both verbs', async ({ request }) => {
    expect((await request.get(url(owner.projectId), { headers: as(stranger.token) })).status()).toBe(404);
    const post = await request.post(url(owner.projectId), {
      headers: as(stranger.token),
      data: { action: 'confirm', passed: 2, failed: 0, system: 'S4D / 100', ranOn: '2026-10-01' },
    });
    expect(post.status()).toBe(404);
  });

  test('an invited reader reads and cannot write', async ({ request }) => {
    const get = await request.get(url(owner.projectId), { headers: as(reader.token) });
    expect(get.status()).toBe(200);
    const post = await request.post(url(owner.projectId), {
      headers: as(reader.token),
      data: { action: 'import', fileName: 'r.xml', xml: passingJunit(['TC_01', 'TC_02']) },
    });
    expect(post.status()).toBe(404);
  });

  test('the owner is validated: media type, shape, extension, DTD, size', async ({ request }) => {
    const textPlain = await request.post(url(owner.projectId), {
      headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'text/plain' },
      data: 'hello',
    });
    expect(textPlain.status()).toBe(415);
    expect((await request.post(url(owner.projectId), { headers: as(owner.token), data: {} })).status()).toBe(400);
    const txt = await request.post(url(owner.projectId), { headers: as(owner.token), data: { action: 'import', fileName: 'r.txt', xml: passingJunit(['TC_01']) } });
    expect(txt.status()).toBe(415);
    const xxe = await request.post(url(owner.projectId), {
      headers: as(owner.token),
      data: { action: 'import', fileName: 'r.xml', xml: '<!DOCTYPE t [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite><testcase name="&x;"/></testsuite>' },
    });
    expect(xxe.status()).toBe(422);
    expect((await xxe.json()).code).toBe('dtd-refused');
    const big = await request.post(url(owner.projectId), {
      headers: as(owner.token),
      data: { action: 'import', fileName: 'r.xml', xml: `<testsuite>${'<testcase name="x"/>'.repeat(60_000)}</testsuite>` },
    });
    expect(big.status()).toBe(413);
    const future = await request.post(url(owner.projectId), {
      headers: as(owner.token),
      data: { action: 'confirm', passed: 2, failed: 0, system: 'S4D', ranOn: '2099-01-01' },
    });
    expect(future.status()).toBe(400);
  });

  test('an import is matched, stored without the file, and its summary lands on the project', async ({ request }) => {
    const xml = `${passingJunit(['TC_01', 'TC_02'])}`.replace('</testsuite>', '<testcase name="HELPER"/></testsuite>');
    const res = await request.post(url(owner.projectId), { headers: as(owner.token), data: { action: 'import', fileName: 'C:\\runs\\aunit.xml', xml } });
    expect(res.status()).toBe(200);
    const { record } = await res.json();
    expect(record).toMatchObject({
      kind: 'imported',
      scenarioCount: 2,
      coverage: { passed: 2, failed: 0, skipped: 0, none: 0 },
      unmatchedTotal: 1,
      file: { name: 'aunit.xml', format: 'junit' },
    });
    expect(record.file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.results.map((r: { outcome: string }) => r.outcome)).toEqual(['passed', 'passed']);

    const stored = await adminGetDoc(`projects/${owner.projectId}/test_results`, 'current');
    expect(stored?.recordedByUid).toBe(owner.uid);
    expect(JSON.stringify(stored), 'the raw file was stored').not.toContain('<testsuite');
    const project = await adminGetDoc('projects', owner.projectId);
    expect(project?.outsideTestResult).toMatchObject({ kind: 'imported', scenarioCount: 2 });
    expect(JSON.stringify(project?.outsideTestResult)).not.toContain('<testsuite');
    // The reader reads the same record.
    const forReader = await (await request.get(url(owner.projectId), { headers: as(reader.token) })).json();
    expect(forReader.record.kind).toBe('imported');
    expect(forReader.record.recordedByUid, 'the owner uid leaks to the reader').toBeUndefined();
  });

  test('a confirmation replaces it, with the account and the time', async ({ request }) => {
    const res = await request.post(url(owner.projectId), {
      headers: as(owner.token),
      data: { action: 'confirm', passed: 2, failed: 0, system: 'S4D / 100', ranOn: '2026-10-02', note: '<b>all green</b>' },
    });
    expect(res.status()).toBe(200);
    const { record } = await res.json();
    expect(record).toMatchObject({ kind: 'confirmed', passed: 2, failed: 0, system: 'S4D / 100', ranOn: '2026-10-02', note: '<b>all green</b>' });
    expect(record.recordedBy).toBe(owner.email);
  });

  test('a project off the ABAP Cloud route is refused with 409', async ({ request }) => {
    const res = await request.post(url(stranger.projectId), {
      headers: as(stranger.token),
      data: { action: 'confirm', passed: 1, failed: 0, system: 'S4D', ranOn: '2026-10-02' },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('not-abap-route');
  });

  test('a browser cannot write the summary or the record — the rules have no grant for either', async () => {
    const app = initializeApp(firebaseConfig, `sap-results-rules-${Date.now()}`);
    const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
    const auth = getAuth(app);
    connectFirestoreToEmulator(db);
    connectAuthToEmulator(auth);
    await signInWithEmailAndPassword(auth, owner.email, owner.password);
    const forged = { v: 1, kind: 'confirmed', passed: 99, failed: 0 };
    await expect(updateDoc(doc(db, 'projects', owner.projectId), { outsideTestResult: forged })).rejects.toThrow();
    await expect(setDoc(doc(db, 'projects', owner.projectId, 'test_results', 'current'), forged)).rejects.toThrow();
  });
});
