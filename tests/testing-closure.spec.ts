import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Project } from '../lib/types';
import { testRunSubject, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '../lib/test-receipt';
import {
  CLOSED_NOT_VERIFIED,
  closureSentence,
  failureCause,
  nextTestRunFailure,
  subjectKey,
  testingClosureReading,
  testRunFailureReading,
  validateClosureBody,
  type TestingClosure,
} from '../lib/testing-closure';
import { phaseActionLabel, testingClosureBasis, workflowSteps } from '../lib/workflow-steps';
import { NOTHING_OPEN, NOTHING_OPEN_TESTS_NOT_VERIFIED, nextOpenPoint, nothingOpenText } from '../lib/next-step';
import { buildHandoverChain, handoverFacets, handoverNextStep, handoverStillNeeded, confirmationsOf, handoverTimeline } from '../lib/handover';
import { workspaceStatusLine } from '../lib/workspace-model';
import { validateProjectCommand, SERVER_ONLY_PROJECT_FIELDS, fieldsWrittenByCommands, type ProjectCommandState } from '../lib/project-commands';
import { attestationsOf } from '../lib/audit-pack-build';
import { generateUserAttestations } from '../lib/audit-pack';
import { steeringOnePager } from '../lib/steering-one-pager';
import { deliveryTestingTitle, lastRun } from '../components/testing/testing-summary';
import type { StandardFit } from '../lib/standard-fit';

/**
 * ADR-094 — owner report of 11.10.2026 (FI_Collection_Worklist): "The test
 * runner failed, yet I am asked again and again to run the tests and tests count
 * as open. Negative cases need a way to come to a conclusion anyway."
 *
 * Server-free: the records, the phase contract, the next step, the handover,
 * the workspace facet, the steering line, the audit pack and the two commands,
 * all as pure functions over a project document shaped like the production one
 * (a CAP package, ten cases, no receipt).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PACKAGE = JSON.stringify([
  { path: 'srv/service.ts', content: 'export class AgingEngine {}' },
  { path: 'package.json', content: '{}' },
  { path: 'db/schema.cds', content: 'entity X {}' },
]);
const SUITE = "import { test } from 'node:test';\nimport { AgingEngine } from './srv/service';\ntest('TC_01: a', () => {});";
const CASES = Array.from({ length: 10 }, (_, i) => ({ id: `TC_${String(i + 1).padStart(2, '0')}`, name: `Case ${i + 1}` }));

function base(extra: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'FI_Collection_Worklist',
    userId: 'owner-uid',
    legacyCode: 'REPORT zfi_ar_collection_worklist.\nWRITE 1.',
    activeRunId: 'run-1',
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    solutionDesign: 'design',
    approvedByArchitect: true,
    generatedCode: PACKAGE,
    documentation: 'docs',
    testSuite: { code: SUITE },
    testCases: CASES,
    ...extra,
  } as unknown as Project;
}

const BUILD_ERROR =
  'Compilation failed:\nBuild failed with 1 error:\n<sandbox>/test.ts:162:27: ERROR: Expected ")" but found "\'=SUM(A1:B2)\'"';

function withFailure(p: Project, at = '2026-10-11T14:35:02.000Z', attempts = 1): Project {
  let stored: unknown = null;
  for (let i = 0; i < attempts; i++) {
    stored = nextTestRunFailure(stored, { subject: testRunSubject(p), at, by: 'owner-uid', kind: 'build-error', cause: BUILD_ERROR });
  }
  return { ...p, testRunFailure: stored } as Project;
}

function receipt(p: Project, at: string, verdict: 'Passed' | 'Failed'): TestRunReceipt {
  const s = testRunSubject(p);
  return {
    v: TEST_RUN_RECEIPT_VERSION,
    runId: s.runId,
    codeDigest: s.codeDigest,
    suiteDigest: s.suiteDigest,
    casesDigest: s.casesDigest,
    environment: 'mock',
    scope: { selected: null, cases: CASES.length },
    stubs: [],
    executedAt: at,
    executedBy: 'owner-uid',
    exitCode: verdict === 'Passed' ? 0 : 1,
    verdicts: CASES.map((c) => ({ id: c.id, status: verdict })),
  };
}

const ACTOR = { email: 'owner@example.com', now: '2026-10-11T15:00:00.000Z' };

function closeState(p: Project): ProjectCommandState {
  return {
    activeRunId: p.activeRunId,
    testingClosureBasis: testingClosureBasis(p),
    testSubject: testRunSubject(p),
    testingClosure: (p as { testingClosure?: unknown }).testingClosure,
  };
}

function closed(p: Project, reason = 'runner-failed', note?: string): Project {
  const basis = testingClosureBasis(p);
  if (!basis.ok) throw new Error(basis.error);
  const result = validateProjectCommand(
    { command: 'close-testing', reason, ...(note ? { note } : {}), expectedSubject: basis.subjectKey },
    closeState(p),
    ACTOR,
  );
  if (!result.ok) throw new Error(result.error);
  return { ...p, ...(result.fields as Partial<Project>) } as Project;
}

const testingOf = (p: Project) => workflowSteps(p).find((s) => s.key === 'testing')!;
const deliveryOf = (p: Project) => workflowSteps(p).find((s) => s.key === 'delivery')!;

/* ================================================================ a failed run */

test.describe('a run that gave no result is on record as such', () => {
  test('the cause is the compiler’s own line, without the run directory', () => {
    expect(failureCause(BUILD_ERROR)).toBe('test.ts:162:27: ERROR: Expected ")" but found "\'=SUM(A1:B2)\'"');
    expect(failureCause('The test runner is not reachable.\nmore')).toBe('The test runner is not reachable.');
    expect(failureCause('x'.repeat(400)).length).toBeLessThanOrEqual(240);
  });

  test('attempts count up for the same code and suite, and start again for another', () => {
    const p = base();
    const three = withFailure(p, '2026-10-11T14:35:02.000Z', 3);
    expect((three as { testRunFailure: { attempts: number } }).testRunFailure.attempts).toBe(3);
    const other = base({ testSuite: { code: SUITE + '\n// changed' } } as Partial<Project>);
    const restarted = nextTestRunFailure((three as { testRunFailure: unknown }).testRunFailure, {
      subject: testRunSubject(other), at: '2026-10-11T15:00:00.000Z', by: 'owner-uid', kind: 'runner-error', cause: 'x',
    });
    expect(restarted.attempts).toBe(1);
  });

  test('the phase says "Run failed" with the cause and the count — never "no test run on record"', () => {
    const p = withFailure(base(), '2026-10-11T14:35:02.000Z', 3);
    const testing = testingOf(p);
    expect(testing.state).toBe('partial');
    expect(testing.badge).toBe('Run failed');
    expect(testing.runFailed).toBe(true);
    expect(testing.detail).toContain('gave no result (3 attempts in a row)');
    expect(testing.detail).toContain('did not compile in the runner');
    expect(testing.detail).toContain('test.ts:162:27');
    expect(testing.detail).not.toContain('no test run on record');
    // Without the record, the draft line it replaces.
    expect(testingOf(base()).detail).toContain('no test run on record');
  });

  test('the next step stops asking to run the tests again', () => {
    const p = withFailure(base());
    expect(phaseActionLabel(testingOf(p), true)).toBe('Review the failed run');
    const point = nextOpenPoint(p)!;
    expect(point.key).toBe('testing');
    expect(point.action).toBe('Review the failed run');
    expect(point.reason).toContain('gave no result');
    // A draft nobody ran is still "Run the tests".
    expect(nextOpenPoint(base())!.action).toBe('Run the tests');
  });

  test('a receipt recorded after it covers the suite: the failure is history', () => {
    const p = withFailure(base(), '2026-10-11T14:35:02.000Z');
    const ran = { ...p, testRunReceipt: receipt(p, '2026-10-11T16:00:00.000Z', 'Failed'), testCases: CASES.map((c) => ({ ...c, status: 'Failed' })) } as Project;
    expect(testRunFailureReading(ran).state).toBe('none');
    // …and a failure for other code is "earlier", never current.
    const moved = { ...p, generatedCode: PACKAGE.replace('AgingEngine', 'Other') } as Project;
    expect(testRunFailureReading(moved).state).toBe('earlier');
    expect(testingOf(moved).badge).toBe('Test draft');
  });

  test('the Testing tool and Delivery read the same record', () => {
    const p = withFailure(base(), '2026-10-11T14:35:02.000Z', 2);
    const run = lastRun(p, null);
    expect(run.kind).toBe('failed');
    expect(deliveryTestingTitle(p, false)).toBe('Run failed: 10 Sandbox tests, the last run gave no result (2 attempts)');
  });
});

/* ======================================================= what may be closed */

test.describe('what testing may be closed on', () => {
  test('nothing failed: there is nothing to close yet', () => {
    const basis = testingClosureBasis(base());
    expect(basis.ok).toBe(false);
    expect(!basis.ok && basis.code).toBe('nothing-failed');
  });

  test('a run that gave no result, a run with failures, and a route with no runner each are a basis', () => {
    const failed = testingClosureBasis(withFailure(base()));
    expect(failed.ok && failed.basis.kind).toBe('run-error');
    expect(failed.ok && failed.subjectKey).toBe(subjectKey(testRunSubject(base())));

    const p = base();
    const failing = { ...p, testRunReceipt: receipt(p, '2026-10-11T16:00:00.000Z', 'Failed'), testCases: CASES.map((c) => ({ ...c, status: 'Failed' })) } as Project;
    const onFailures = testingClosureBasis(failing);
    expect(onFailures.ok && onFailures.basis.kind).toBe('failed-run');
    expect(onFailures.ok && onFailures.basis.line).toContain('0 of 10 passed, 10 failed');

    const abap = testingClosureBasis(base({ extensibilityRoute: 'In-App (ABAP Cloud)' }));
    expect(abap.ok && abap.basis.kind).toBe('no-runner');
  });

  test('a passing run, a stale suite and no suite are refused', () => {
    const p = base();
    const passing = { ...p, testRunReceipt: receipt(p, '2026-10-11T16:00:00.000Z', 'Passed'), testCases: CASES.map((c) => ({ ...c, status: 'Passed' })) } as Project;
    const done = testingClosureBasis(passing);
    expect(!done.ok && done.code).toBe('testing-done');
    expect(testingClosureBasis(base({ testCases: [] } as Partial<Project>)).ok).toBe(false);
    const noRun = testingClosureBasis(base({ activeRunId: undefined } as Partial<Project>));
    expect(!noRun.ok && noRun.code).toBe('no-run');
  });

  test('the reasons fit the basis; "another reason" needs words', () => {
    expect(validateClosureBody({ reason: 'runner-failed' }, 'run-error').ok).toBe(true);
    expect(validateClosureBody({ reason: 'runner-failed' }, 'no-runner').ok).toBe(false);
    expect(validateClosureBody({ reason: 'failures-accepted' }, 'run-error').ok).toBe(false);
    expect(validateClosureBody({ reason: 'failures-accepted' }, 'failed-run').ok).toBe(true);
    expect(validateClosureBody({ reason: 'other' }, 'run-error').ok).toBe(false);
    expect(validateClosureBody({ reason: 'other', note: '  tested by QA  ' }, 'run-error')).toEqual({ ok: true, value: { reason: 'other', note: 'tested by QA' } });
    expect(validateClosureBody({ reason: 'passed' }, 'run-error').ok).toBe(false);
    expect(validateClosureBody({ reason: 'tested-elsewhere', note: 'x'.repeat(501) }, 'run-error').ok).toBe(false);
  });
});

/* ============================================================= the commands */

test.describe('close-testing and reopen-testing', () => {
  test('close-testing writes the closure: the server’s basis, the account and the time — and only that field', () => {
    const p = withFailure(base());
    const basis = testingClosureBasis(p);
    if (!basis.ok) throw new Error('expected a basis');
    const result = validateProjectCommand(
      // A basis in the body is ignored: the record of what failed is the server's.
      { command: 'close-testing', reason: 'runner-failed', note: 'Repairs did not compile', expectedSubject: basis.subjectKey, basis: { kind: 'failed-run', line: 'forged' } },
      closeState(p),
      ACTOR,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action).toBe('PROJECT_TESTING_CLOSED');
    expect(Object.keys(result.fields)).toEqual(['testingClosure']);
    const c = result.fields.testingClosure as TestingClosure;
    expect(c.account).toBe('owner@example.com');
    expect(c.at).toBe(ACTOR.now);
    expect(c.basis).toEqual(basis.basis);
    expect(c.basis.line).not.toContain('forged');
    expect(c.subject).toEqual(testRunSubject(p));
    expect(c.note).toBe('Repairs did not compile');
  });

  test('a closure of other code or suite, an unknown basis, or nothing to close on is refused, and writes nothing', () => {
    const p = withFailure(base());
    const moved = validateProjectCommand({ command: 'close-testing', reason: 'runner-failed', expectedSubject: 'not-this-one' }, closeState(p), ACTOR);
    expect(!moved.ok && moved.status).toBe(409);
    expect(!moved.ok && moved.code).toBe('tests-moved');
    const unknown = validateProjectCommand({ command: 'close-testing', reason: 'runner-failed', expectedSubject: 'x' }, { activeRunId: 'run-1' }, ACTOR);
    expect(!unknown.ok && unknown.code).toBe('testing-unknown');
    const nothing = validateProjectCommand(
      { command: 'close-testing', reason: 'tested-elsewhere', expectedSubject: subjectKey(testRunSubject(base())) },
      closeState(base()),
      ACTOR,
    );
    expect(!nothing.ok && nothing.code).toBe('nothing-failed');
    const twice = validateProjectCommand(
      { command: 'close-testing', reason: 'tested-elsewhere', expectedSubject: subjectKey(testRunSubject(base())) },
      closeState(closed(withFailure(base()))),
      ACTOR,
    );
    expect(!twice.ok && twice.code).toBe('already-closed');
  });

  test('reopen-testing clears it; without a closure there is nothing to reopen', () => {
    const c = closed(withFailure(base()));
    const reopened = validateProjectCommand({ command: 'reopen-testing' }, closeState(c), ACTOR);
    expect(reopened.ok && reopened.fields).toEqual({ testingClosure: null });
    const again = { ...c, testingClosure: null } as Project;
    expect(testingClosureReading(again).state).toBe('none');
    expect(testingOf(again).badge).toBe('Run failed');
    const none = validateProjectCommand({ command: 'reopen-testing' }, closeState(base()), ACTOR);
    expect(!none.ok && none.code).toBe('not-closed');
  });

  test('the field is server-only, and the command route is its writer', () => {
    expect(SERVER_ONLY_PROJECT_FIELDS).toContain('testingClosure');
    expect(fieldsWrittenByCommands()).toContain('testingClosure');
    const route = read('app/api/projects/[projectId]/commands/route.ts');
    expect(route).toMatch(/testingClosureBasis\(project as Project\)/);
    expect(route).toMatch(/testSubject = closing \? testRunSubject\(project\)/);
    // Not a client-writable key: the rules allowlist does not name either record.
    const rules = read('firestore.rules');
    expect(rules).not.toContain('testingClosure');
    expect(rules).not.toContain('testRunFailure');
  });
});

/* ===================================================== closed, not verified */

test.describe('closed without a passing run: done, never proven', () => {
  test('the phase is done, not proven, and says "not verified" with who, when and why', () => {
    const c = closed(withFailure(base()), 'runner-failed');
    const testing = testingOf(c);
    expect(testing.state).toBe('done');
    expect(testing.proven).toBe(false);
    expect(testing.mock).toBe(false);
    expect(testing.closedUnverified).toBe(true);
    expect(testing.badge).toBe(CLOSED_NOT_VERIFIED);
    expect(testing.detail).toContain('Closed without a passing run by owner@example.com on 11 Oct 2026');
    expect(testing.detail).toContain('the runner failed here');
    expect(testing.detail).toContain('Not verified');
    for (const word of [/\bproven\b/i, /\bpassed\b/i]) expect(testing.badge).not.toMatch(word);
    expect(testing.badge).toContain('not verified');
  });

  test('the project moves on: Delivery is ready with the tests named "not verified", and nothing is open', () => {
    const c = closed(withFailure(base()), 'tested-elsewhere');
    const delivery = deliveryOf(c);
    expect(delivery.state).toBe('done');
    expect(delivery.proven).toBe(false);
    expect(delivery.closedUnverified).toBe(true);
    expect(delivery.badge).toBe('Ready · tests not verified');
    expect(delivery.detail).toContain('tests are not verified');
    expect(nextOpenPoint(c)).toBeNull();
    expect(nothingOpenText(workflowSteps(c))).toBe(NOTHING_OPEN_TESTS_NOT_VERIFIED);
    expect(nothingOpenText(workflowSteps(base()))).toBe(NOTHING_OPEN);
  });

  test('the handover names it instead of blocking on it', () => {
    const c = closed(withFailure(base()), 'tested-elsewhere', 'UAT in Q01');
    const phases = workflowSteps(c);
    const chain = buildHandoverChain(c as Parameters<typeof buildHandoverChain>[0], phases);
    const tests = chain.find((l) => l.key === 'tests')!;
    expect(tests.state).toBe('on-record');
    expect(tests.provenance).toBe('confirmed');
    expect(tests.provenance).not.toBe('proven');
    expect(tests.by).toBe('owner@example.com');
    expect(tests.missing).toContain('Tests: not verified — closed by owner@example.com on 11 Oct 2026: tested in our own system (“UAT in Q01”).');
    const state = { blockers: [], exportedAt: null };
    expect(handoverStillNeeded(c as never, chain, state).map((n) => n.key)).not.toContain('tests');
    const next = handoverNextStep(c as never, phases, [], chain, 'p1');
    expect(next.headline).not.toBe('Run the test suite');
    expect(next.reason).toContain('testing was closed without a passing run (not verified)');
    const quality = handoverFacets(c as never, phases, chain, state).find((f) => f.key === 'quality')!;
    expect(quality.value).toBe('Not verified');
    expect(confirmationsOf(c as never).some((x) => x.what.startsWith('Closed testing without a passing run — not verified'))).toBe(true);
    expect(handoverTimeline(c as never).some((e) => e.sentence.includes('Testing closed without a passing run'))).toBe(true);
    // Without the closure the same project still waits on the run.
    const open = withFailure(base());
    const openNext = handoverNextStep(open as never, workflowSteps(open), [], buildHandoverChain(open as never, workflowSteps(open)), 'p1');
    expect(openNext.kind).toBe('open');
  });

  test('IT and Management: the Execution facet is a draft with the Confirmed chip, never done', () => {
    const c = closed(withFailure(base()));
    const execution = workspaceStatusLine(c).find((f) => f.facet === 'execution')!;
    expect(execution.status).toBe('draft');
    expect(execution.provenance).toBe('confirmed');
    expect(execution.detail).toMatch(/not verified/i);
  });

  test('the steering one-pager says it where it says the project’s standing', () => {
    const c = closed(withFailure(base()));
    const src = {
      mode: 'project' as const,
      base: '/project/p1',
      program: 'ZFI_AR_COLLECTION_WORKLIST',
      date: '2026-10-11',
      project: c,
      hasRun: true,
      history: null,
      open: null,
      findings: null,
      fit: { state: 'not-determined', why: 'no-run', reason: 'x', platform: null } as unknown as StandardFit,
      decision: null,
      process: null,
    };
    expect(steeringOnePager(src).header.status).toContain('tests not verified (closed without a passing run)');
    expect(steeringOnePager({ ...src, project: withFailure(base()) }).header.status).not.toContain('tests not verified');
  });

  test('the audit pack carries it as the account’s statement, outside the signature', () => {
    const c = closed(withFailure(base()), 'not-testable-here');
    const attested = attestationsOf(c as unknown as Record<string, unknown>);
    expect(attested.testingClosure).toBe(closureSentence((c as { testingClosure: TestingClosure }).testingClosure));
    const file = generateUserAttestations(attested, { projectId: 'p1', runId: 'run-1' });
    expect(file).toContain('| Testing closed without a passing run (not verified) | Closed without a passing run by owner@example.com on 11 Oct 2026: not testable here. |');
    expect(attestationsOf(base() as unknown as Record<string, unknown>).testingClosure).toBeUndefined();
  });

  test('a run after the closure reopens testing; a pass outranks it; other code makes it no longer apply', () => {
    const c = closed(withFailure(base()));
    const later = withFailure(c, '2026-10-11T16:00:00.000Z');
    expect(testingClosureReading(later).state).toBe('superseded');
    expect(testingOf(later).closedUnverified).toBeUndefined();
    expect(testingOf(later).badge).toBe('Run failed');

    const passing = { ...c, testRunReceipt: receipt(c, '2026-10-11T16:00:00.000Z', 'Passed'), testCases: CASES.map((x) => ({ ...x, status: 'Passed' })) } as Project;
    expect(testingOf(passing).proven).toBe(true);
    expect(testingOf(passing).closedUnverified).toBeUndefined();

    const regenerated = { ...c, testSuite: { code: SUITE + '\n// regenerated' } } as Project;
    expect(testingClosureReading(regenerated).state).toBe('earlier');
    expect(testingOf(regenerated).state).toBe('partial');
  });
});

/* ======================================================= the runner and repair */

test.describe('the run that failed in production', () => {
  test('/api/run-tests records a run of the project’s own suite that gave no result — not a draft’s, not a live one', () => {
    const route = read('app/api/run-tests/route.ts');
    expect(route).toContain("const recordsFailure = !draft && mode === 'mock';");
    for (const kind of ["'runner-unavailable', target.reason", "'runner-error', call.reason", "'runner-unavailable', outcome.reason", "'build-error', execution.buildError"]) {
      expect(route, kind).toContain(`recordRunFailure(sanitizedProjectId, decodedToken.uid, projectData, ${kind})`);
    }
    // Only onto the project the run read, as it stood — the receipt's own condition.
    expect(route).toMatch(/async function recordRunFailure[\s\S]*now\.userId !== uid \|\| !sameTestRunInputs\(read, now\)[\s\S]*tx\.set\(ref, \{ testRunFailure: failure \}, \{ merge: true \}\)/);
  });
});
