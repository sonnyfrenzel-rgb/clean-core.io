/**
 * Roadmap 3.0.19, part C — the owner decisions of 19.10.2026.
 *
 *   1. Key user is the recommendation where the engine reads the whole program
 *      as key user; RAP or CAP is then the departure that needs a reason.
 *   2. The score is unchanged: it scores the code as it is; "level A by
 *      construction" stands beside it.
 *   3. The key-user acceptance checks can be recorded as run in the account's
 *      system — a self-declaration, server-written; then Testing is done and
 *      Delivery has no gap.
 *   4. A program that splits builds units for its code parts only (scaffold 20).
 *   5. Key user is its own cost option: key-user days × the account's own rate,
 *      nothing proposed; Rebuild unchanged.
 *   6. docs/decision.md: the weighing has a key-user row for 3.0.19 runs only.
 *   8. The key-user thresholds: 20 statements of custom logic, 40 of a list —
 *      Clean-Core.io's rule, not SAP's.
 *   9. The acceptance suite records a whole key-user program as "no code by
 *      decision", not as a failure.
 *
 * Server-free: pure modules, plus source guards where the behaviour lives in a
 * page or a route that needs Firebase. (7, the gallery, is in
 * tests/example-catalog.spec.ts.)
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Project } from '../lib/types';
import { sha256Hex } from '../lib/artefact-digest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { KEY_USER_LIST_MAX_STATEMENTS, KEY_USER_LOGIC_MAX_STATEMENTS } from '../lib/abap/key-user-candidates';
import { recommendationOfProject } from '../lib/contract-build';
import { recommendationOfRoute, recommendedArchitecture, validateProjectCommand } from '../lib/project-commands';
import { signOffRecommendation } from '../lib/design-recommendation';
import { decisionWeighing } from '../lib/decision-weighing';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { buildKeyUserSteps } from '../lib/key-user-steps';
import { keyUserEvidenceBlock, keyUserPlanRanges } from '../lib/key-user-route';
import {
  KEY_USER_ACCEPTANCE_VERSION,
  keyUserAcceptanceReading,
  keyUserCheckIds,
  keyUserListDigest,
  mergeKeyUserAcceptance,
  validateKeyUserConfirmation,
  type KeyUserAcceptanceSummary,
} from '../lib/key-user-acceptance';
import { workflowSteps } from '../lib/workflow-steps';
import { buildHandoverChain, type HandoverProject } from '../lib/handover';
import { planUnits } from '../lib/transformation/unit-plan';
import { prepareEngineLed } from '../lib/transformation/engine-led';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { costComparison, emptyCostAssumptions, OPTION_KINDS, type CostOption } from '../lib/cost-assumptions';
import { ARCHITECTURE_OPTION } from '../lib/decision-draft';
import { optionOfCostKind } from '../lib/decision-options';
import { optionGeneratesNothing } from '../lib/project-decision';
import { buildProjectDecision } from '../lib/project-decision-build';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { keyUserPlanOf } from '../scripts/acceptance/suite';
import { loadPrograms, loadSource } from '../scripts/acceptance/suite';
import { readExample } from './helpers/starter-example-files';

const NEW = 'v3.0.19';
const OLD = 'v3.0.18';
const EXAMPLE = 'Z_SD_DELIVERY_PRIORITY.abap';
const WHOLE = readExample(EXAMPLE).replace(/\r\n/g, '\n');
/** The example with one routine that writes and commits: the list stays code, the BAdI, field and settings stay key user. */
const SPLIT =
  WHOLE.replace('  PERFORM write_totals.\n', '  PERFORM write_totals.\n  PERFORM log_run.\n') +
  '\nFORM log_run.\n  UPDATE zsd_prio_log SET last_run = sy-datum WHERE vkorg = p_vkorg.\n  COMMIT WORK.\nENDFORM.\n';

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function project(extra: Record<string, unknown> = {}, source = WHOLE, engine = NEW): HandoverProject {
  return {
    id: 'p-ku-c',
    name: 'Delivery priority',
    userId: 'owner-uid',
    legacyCode: source,
    activeRunId: 'run-ku-0002',
    extensibilityRoute: 'In-App (ABAP Cloud)',
    originalRecommendation: 'keyuser',
    cleanCoreScore: 93,
    s4Deployment: 'private',
    analyzerVersion: engine,
    solutionDesign: '# Design',
    targetArchitecture: 'keyuser',
    approvedByArchitect: true,
    architectJustifiedOverride: '',
    auditMetadata: {
      inputFingerprint: { sha256: sha256Hex(source), fileName: EXAMPLE, lineCount: source.split('\n').length, uploadedAt: '2026-10-19T08:00:00.000Z', objectType: 'Report' },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: engine, byokUsed: false },
    },
    ...extra,
  } as unknown as HandoverProject;
}
const phase = (p: Project | null, key: string) => workflowSteps(p).find((s) => s.key === key)!;
const listOf = (source = WHOLE, engine = NEW) => buildKeyUserSteps(buildAbapEvidence(source, EXAMPLE, 'private', undefined, engine).keyUser)!;

/* ------------------------------------------------------------- 1. the recommendation */

test.describe('1. key user is the recommendation where the whole program is key user', () => {
  test('a run records keyuser for a whole-program reading, the code route otherwise and before 3.0.19', () => {
    const route = (source: string, engine: string) => routeExtensibility(buildAbapEvidence(source, EXAMPLE, 'private', undefined, engine), 'private', engine);
    expect(recommendationOfRoute(route(WHOLE, NEW))).toBe('keyuser');
    // Partial: RAP/CAP stays for the code part.
    expect(recommendationOfRoute(route(SPLIT, NEW))).toBe('rap');
    expect(recommendationOfRoute(route(WHOLE, OLD))).toBe('rap');
    expect(recommendationOfRoute({ recommendedRoute: 'Side-by-Side (SAP BTP)' })).toBe('cap');
    // The stored value is read back as the decision vocabulary.
    expect(recommendedArchitecture({ originalRecommendation: 'keyuser' })).toBe('keyuser');
  });

  test('the server derives keyuser too, and a RAP sign-off without a reason is refused', () => {
    expect(recommendationOfProject(project())).toBe('keyuser');
    expect(recommendationOfProject(project({}, SPLIT))).toBe('rap');
    expect(recommendationOfProject(project({}, WHOLE, OLD))).toBe('rap');

    const RUN = { evidenceReport: [{ id: 'f1' }], runHash: 'c'.repeat(64) };
    const DIGEST = evidenceDigest(RUN);
    const state = { activeRunId: 'run-1', activeRunEvidence: DIGEST, contractRecommendation: 'keyuser' as const };
    const actor = { email: 'owner@example.com', now: '2026-10-19T10:00:00.000Z' };
    const body = (extra: Record<string, unknown>) => ({ command: 'approve-architecture', expectedRunId: 'run-1', expectedEvidenceDigest: DIGEST, ...extra });
    const rap = validateProjectCommand(body({ targetArchitecture: 'rap' }), state, actor);
    expect(rap.ok).toBe(false);
    if (!rap.ok) expect(rap.code).toBe('override-needs-reason');
    expect(validateProjectCommand(body({ targetArchitecture: 'rap', justification: 'The BAdI is not released for key users in our release.' }), state, actor).ok).toBe(true);
    expect(validateProjectCommand(body({ targetArchitecture: 'keyuser' }), state, actor).ok).toBe(true);
  });

  test('the sign-off dialog names keyuser, and the weighing calls a code build the departure', () => {
    expect(signOffRecommendation({ recommended: 'in-app-rap' }, null, true)).toEqual({ code: 'keyuser', basis: 'contract' });
    expect(signOffRecommendation({ recommended: 'in-app-rap' }, null)).toEqual({ code: 'rap', basis: 'contract' });
    const w = decisionWeighing({
      subject: 'Z', hasRun: true, decision: null, status: null, engineRoute: 'keyuser', engineReasoning: null, usage: null, design: null,
      keyUser: { scope: 'whole-program', sentence: 'Every part is a key-user candidate.', parts: { total: 4, keyUser: 4, code: 0, notDetermined: 0 } },
    });
    const row = (k: string) => w.rows.find((r) => r.key === k)!;
    expect(row('keyuser').signal).toBe('for');
    expect(row('rap').signal).toBe('against');
    expect(row('rap').why).toContain('departs from the recommendation and needs a reason');
    expect(row('cap').signal).toBe('against');
  });

  test('every writer of originalRecommendation goes through recommendationOfRoute', () => {
    expect(read('app/api/runs/create/route.ts')).toContain("recommendationOfRoute(extensibilityReport) === 'keyuser' ? 'keyuser' : extensibilityReport.recommendedRoute");
    expect(read('lib/analysis-run.ts')).toContain('originalRecommendation: recommendationOfRoute(routeReport)');
    expect(read('app/(app)/project/[projectId]/analyze/page.tsx').match(/originalRecommendation: recommendationOfRoute\(computedRouteReport\)/g)).toHaveLength(2);
    expect(read('app/(app)/project/[projectId]/design/page.tsx')).toContain("keyUserList?.scope === 'whole-program'");
  });

  test('a key-user decision rests on the sign-off, like the options that build nothing, and prices as its own kind', () => {
    expect(ARCHITECTURE_OPTION.keyuser.kind).toBe('keyuser');
    expect(optionOfCostKind('keyuser')).toBe('rebuild');
    expect(optionGeneratesNothing('keyuser')).toBe(true);
    expect(optionGeneratesNothing('rebuild')).toBe(false);
  });

  // QA review of 317d5f7a9c53, 2dc0e9055239: a key-user sign-off may carry no reason, and the binding said
  // "with its reason" all the same.
  test('the binding of a reasonless key-user sign-off says it records no reason; one with a reason says so', () => {
    const contractNote = (reason: string) => buildProjectDecision({
      summary: 'Configure it with key-user tools.',
      runId: 'run-ku-0002', evidenceDigest: 'digest', contract: null, assumptions: null, comparison: null,
      chosenOptionId: 'keyuser', chosenOptionKind: 'keyuser',
      need: { revision: null, confirmedDrops: 0, undecided: null }, handedOver: false,
      signOff: { by: 'owner@example.invalid', at: '2026-10-21T08:00:00.000Z', reason, notCurrent: null },
      timeline: { draftedAt: '2026-10-21T09:00:00.000Z' },
    }).bindings.find((b) => b.key === 'contract')!;
    const without = contractNote('');
    expect(without.provenance).toBe('confirmed');
    expect(without.note).not.toContain('with its reason');
    // The builder cannot see the recommendation, so it claims none (QA review of 7fe620f4c919, 974db24613b4).
    expect(without.note).toMatch(/, which records no reason.$/);
    expect(contractNote('Configured by the sales team.').note).toMatch(/, with its reason\.$/);
  });
});

/* ------------------------------------------------------------------ 2. the score */

test('2. the score scores the code as it is; level A by construction stands beside it', () => {
  const route = (engine: string) => routeExtensibility(buildAbapEvidence(WHOLE, EXAMPLE, 'private', undefined, engine), 'private', engine);
  expect(route(NEW).cleanCoreScore).toBe(route(OLD).cleanCoreScore);
  expect(route(NEW).keyUser?.levelByConstruction).toBe('A');
  expect(route(OLD).keyUser).toBeUndefined();
  expect(read('components/analyze/AnalysisAnswer.tsx')).toMatch(/by construction/);
});

/* ------------------------------------------------------- 3. the checks as run, recorded */

test.describe('3. the key-user checks recorded as run in the account’s system — a self-declaration', () => {
  const list = listOf();
  const ids = keyUserCheckIds(list);
  const now = new Date('2026-10-19T12:00:00.000Z');
  const summary = (checkIds: string[], extra: Partial<KeyUserAcceptanceSummary> = {}): KeyUserAcceptanceSummary => ({
    v: KEY_USER_ACCEPTANCE_VERSION,
    kind: 'confirmed',
    subject: { runId: 'run-ku-0002', sourceSha256: sha256Hex(WHOLE) },
    listDigest: keyUserListDigest(list),
    total: ids.length,
    checkIds,
    recordedAt: now.toISOString(),
    recordedBy: 'owner@example.com',
    system: 'S4D / 100',
    ranOn: '2026-10-19',
    note: null,
    ...extra,
  });

  test('the confirmation: all or named checks of the list, a system and a date — refused otherwise', () => {
    expect(ids.length).toBe(list.effort.checks);
    const all = validateKeyUserConfirmation({ checks: 'all', system: 'S4D / 100', ranOn: '2026-10-19' }, ids, now);
    expect(all).toEqual({ ok: true, value: { checkIds: ids, system: 'S4D / 100', ranOn: '2026-10-19', note: null } });
    const some = validateKeyUserConfirmation({ checks: [ids[2], ids[0]], system: 'S4D', ranOn: '2026-10-18' }, ids, now);
    expect(some.ok && some.value.checkIds).toEqual([ids[0], ids[2]]);
    expect(validateKeyUserConfirmation({ checks: ['S9.9'], system: 'S4D', ranOn: '2026-10-18' }, ids, now)).toMatchObject({ ok: false });
    expect(validateKeyUserConfirmation({ checks: 'all', system: '', ranOn: '2026-10-18' }, ids, now)).toMatchObject({ ok: false });
    expect(validateKeyUserConfirmation({ checks: 'all', system: 'S4D', ranOn: '2026-12-01' }, ids, now)).toMatchObject({ ok: false });
    expect(validateKeyUserConfirmation({ checks: [], system: 'S4D', ranOn: '2026-10-18' }, ids, now)).toMatchObject({ ok: false });
  });

  test('per check adds up within the same run and list; another run replaces', () => {
    const first = mergeKeyUserAcceptance(null, { ...summary([ids[1]]) }, ids);
    const second = mergeKeyUserAcceptance(first, { ...summary([ids[0]]) }, ids);
    expect(second.checkIds).toEqual([ids[0], ids[1]]);
    const other = mergeKeyUserAcceptance(second, { ...summary([ids[2]]), subject: { runId: 'run-other', sourceSha256: sha256Hex(WHOLE) } }, ids);
    expect(other.checkIds).toEqual([ids[2]]);
  });

  test('Testing is done and Delivery has no gap once every check is recorded — never proven', () => {
    const none = project({ documentation: '# Process' });
    expect(phase(none, 'testing')).toMatchObject({ state: 'partial', badge: 'Key-user checks' });
    expect(phase(none, 'delivery')).toMatchObject({ state: 'partial' });
    expect(phase(none, 'delivery').detail).toContain('key-user checks not recorded as run');

    const part = project({ documentation: '# Process', keyUserAcceptance: summary(ids.slice(0, 1)) });
    expect(phase(part, 'testing')).toMatchObject({ state: 'partial' });
    expect(phase(part, 'testing').detail).toContain(`1 of ${ids.length} acceptance checks recorded as run in your system`);

    const done = project({ documentation: '# Process', keyUserAcceptance: summary(ids) });
    expect(keyUserAcceptanceReading(done)).toMatchObject({ state: 'current', complete: true });
    expect(phase(done, 'testing')).toMatchObject({ state: 'done', badge: 'Key-user checks confirmed', proven: false });
    expect(phase(done, 'testing').detail).toContain('a self-declaration, not a run here');
    expect(phase(done, 'delivery')).toMatchObject({ state: 'done', badge: 'Ready · key-user steps', proven: false });
    const tests = buildHandoverChain(done, workflowSteps(done)).find((l) => l.key === 'tests')!;
    expect(tests).toMatchObject({ provenance: 'confirmed', provenanceNote: 'self-declaration' });

    // A record for another run, or for another source, counts for nothing.
    const earlier = project({ documentation: '# Process', keyUserAcceptance: summary(ids, { subject: { runId: 'run-old', sourceSha256: sha256Hex(WHOLE) } }) });
    expect(keyUserAcceptanceReading(earlier).state).toBe('earlier');
    expect(phase(earlier, 'testing').state).toBe('partial');
  });

  test('written by the server only, onto a key the client allowlist does not hold — no rules change', () => {
    const route = read('app/api/projects/[projectId]/key-user-checks/route.ts');
    expect(route).toContain('tx.update(projectRef, { keyUserAcceptance: summary })');
    expect(route).toContain('isKeyUserDecision(data)');
    expect(route).toContain('buildProjectEvidence(data, source)');
    expect(route).toContain('sha256Hex(source) !== signedSha');
    expect(read('firestore.rules')).not.toContain('keyUserAcceptance');
    const page = read('app/(app)/project/[projectId]/testing/page.tsx');
    expect(page).toContain('<KeyUserChecksRecord');
    expect(read('components/keyuser/KeyUserChecksRecord.tsx')).toContain('self-declaration');
  });
});

/* ------------------------------------------------- 4. a split program builds its code parts only */

test.describe('4. a split program builds units for its code parts only (scaffold 20)', () => {
  test('the routines a key user configures are no unit, no fill request, no model call', () => {
    expect(SCAFFOLD_VERSION).toBe(20);
    const list = listOf(SPLIT);
    expect(list.scope).toBe('partial');
    const ranges = keyUserPlanRanges(list, 'split')!;
    expect(ranges.ranges.map((r) => [r.lineStart, r.lineEnd, r.step])).toEqual([[49, 72, 'S3'], [74, 81, 'S3']]);
    const before = planUnits(SPLIT, {});
    const after = planUnits(SPLIT, { keyUser: ranges });
    const routines = (p: typeof before) => p.units.map((u) => u.routine).filter(Boolean);
    expect(routines(before)).toEqual(expect.arrayContaining(['LIF_SD_DELIV_PRIO~DERIVE_PRIORITY', 'LIF_SD_DELIV_PRIO~CHECK_PRIORITY', 'LOG_RUN']));
    expect(routines(after)).not.toContain('LIF_SD_DELIV_PRIO~DERIVE_PRIORITY');
    expect(routines(after)).not.toContain('LIF_SD_DELIV_PRIO~CHECK_PRIORITY');
    expect(routines(after)).toContain('LOG_RUN');
    expect(after.notCarried.filter((n) => n.reason === 'key-user').map((n) => [n.lineStart, n.lineEnd])).toEqual([[49, 72], [74, 81]]);
    for (const track of ['rap', 'node'] as const) {
      const all = prepareEngineLed({ source: SPLIT, track, program: 'Z', decisions: [], contextText: '' });
      const code = prepareEngineLed({ source: SPLIT, track, program: 'Z', decisions: [], contextText: '', keyUser: ranges });
      if (!all.ok || !code.ok) throw new Error('the fixture plans');
      expect(code.fillUnits.length, track).toBe(all.fillUnits.length - 2);
      const configured = (p: typeof all) => p.plan.units.filter((u) => /PRIORITY$/.test(u.routine ?? '')).map((u) => u.id);
      expect(configured(all), track).toHaveLength(2);
      expect(configured(code), track).toHaveLength(0);
    }
  });

  test('only a split hands ranges to the planner; the page and TRACE.md say so', () => {
    expect(keyUserPlanRanges(listOf(), 'whole')).toBeNull();
    expect(keyUserPlanRanges(listOf(SPLIT), 'none')).toBeNull();
    expect(keyUserPlanRanges(null, 'split')).toBeNull();
    expect(read('lib/transformation/trace.ts')).toContain('Not generated — configured by a key user from docs/key-user-steps.md');
    const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page.match(/keyUser: keyUserRangesRef\.current/g)).toHaveLength(2);
    expect(page).toContain('const keyUserEvidenceWait = project?.legacyCode ? keyUserEvidenceBlock(project, projectEvidence) : null;');
    expect(page).toContain('keyUserEvidenceWait === null && isOwner');
    expect(page).toContain('prerequisites[0]?.reason ?? keyUserEvidenceWait ??');
  });

  // QA review of 317d5f7a9c53, a78673fa61ff: a failed evidence read used to clear the wait,
  // and the planner then got no key-user ranges and planned the whole source.
  test('a 3.0.19 run generates only on a ready evidence read — a failed read holds it and says why', () => {
    const p = project({ targetArchitecture: 'rap' }, SPLIT);
    expect(keyUserEvidenceBlock(p, { state: 'ready' })).toBeNull();
    // A ready read without a key-user reading holds it too (QA review of 7fe620f4c919, e6be8bc2a9fd).
    expect(keyUserEvidenceBlock(p, { state: 'ready', value: { evidence: {} } })).toMatch(/carry no key-user reading/);
    expect(keyUserEvidenceBlock(p, { state: 'ready', value: { evidence: { keyUser: { scope: 'partial' } } } })).toBeNull();
    expect(keyUserEvidenceBlock(p, { state: 'loading' })).toMatch(/Reading the engine/);
    const failed = keyUserEvidenceBlock(p, { state: 'failed', reason: 'the server answered 503' });
    expect(failed).toContain('the server answered 503');
    expect(failed).toContain('cannot be left out of the code');
    // An older engine has no key-user ranges: nothing is held, as before.
    expect(keyUserEvidenceBlock(project({ targetArchitecture: 'rap' }, SPLIT, OLD), { state: 'failed', reason: 'x' })).toBeNull();
  });
});

/* ------------------------------------------------------------- 5. Economics */

test.describe('5. key user is its own cost option — key-user days × your own rate, nothing proposed', () => {
  const option = (extra: Partial<CostOption> = {}): CostOption => ({
    id: 'keyuser', kind: 'keyuser', label: 'Key user', oneOff: { low: { devDays: 0, testDays: 2 }, high: { devDays: 0, testDays: 4 } },
    perRelease: { devDays: 0, testDays: 0.5 }, maintenanceBaselinePerYear: null, upgradeDelay: null, effortSource: 'stated', ...extra,
  });
  const priced = (o: CostOption) =>
    costComparison({ ...emptyCostAssumptions(), currency: 'EUR', devDayRate: 1000, testDayRate: 600, horizonYears: 3, releaseCadence: { perYear: 1, confirmed: true }, options: [o] }).costs[0];

  test('appended to the kinds; Rebuild is unchanged', () => {
    expect(OPTION_KINDS).toEqual(['do-nothing', 'keep', 'standard', 'rebuild', 'retire', 'keyuser']);
  });

  test('priced with the test/key-user day rate only', () => {
    const c = priced(option());
    expect(c.coverage.state).toBe('covered');
    expect(c.oneOff).toMatchObject({ low: 2 * 600, high: 4 * 600 });
  });

  test('developer days or a proposal refuse the option', () => {
    expect(priced(option({ oneOff: { low: { devDays: 1, testDays: 2 }, high: { devDays: 1, testDays: 4 } } })).coverage.gaps.map((g) => g.code)).toContain('option-keyuser-dev-days');
    expect(priced(option({ effortSource: 'proposal-confirmed' })).coverage.gaps.map((g) => g.code)).toContain('option-keyuser-proposal');
    // Rebuild keeps its developer days.
    expect(priced(option({ id: 'rebuild', kind: 'rebuild', oneOff: { low: { devDays: 1, testDays: 2 }, high: { devDays: 1, testDays: 4 } } })).coverage.state).toBe('covered');
  });

  test('the stage offers it only where the engine read a key-user part, and proposes no days for it', () => {
    const page = read('app/(app)/project/[projectId]/tco/page.tsx');
    expect(page).toContain('withKeyUserOption(a)');
    expect(page).toContain('keyUserSteps.list.steps.length > 0');
    const card = read('components/tco/OptionComparison.tsx');
    expect(card).toContain("proposal && option.kind !== 'keyuser' ? 'proposal' : 'not-entered'");
  });
});

/* ----------------------------------------------------------- 6. docs/decision.md */

test.describe('6. docs/decision.md: a key-user row in the weighing, for 3.0.19 runs only', () => {
  const decisionMd = (p: HandoverProject, keyUser: Parameters<typeof deliveryFactsOf>[1]['keyUser']) => {
    const facts = deliveryFactsOf(p, {
      phases: workflowSteps(p),
      rules: ruleFactsOf(null, 'not read in this test.'),
      score: scoreFactsOf(p, null, 'not read in this test'),
      generatedAt: '2026-10-19T09:00:00.000Z',
      appVersion: NEW,
      referenceSection: '',
      documentationFromEngine: true,
      ...(keyUser !== undefined ? { keyUser } : {}),
    });
    const b = createDeliveryBundle();
    b.folder('docs').file('solution-design.md', '# Design\n');
    const out = finishDeliveryPackage({ entries: b.entries, facts, layout: 'flat' });
    return { facts, md: out.files.find((f) => f.path === 'docs/decision.md')!.content };
  };

  test('with the run’s reading there is a key-user row; without, the weighing is the one of before', () => {
    const reading = buildAbapEvidence(WHOLE, EXAMPLE, 'private', undefined, NEW).keyUser!;
    const withRow = decisionMd(project(), reading);
    expect(withRow.facts.decision.weighing?.rows.map((r) => r.key)).toEqual(['keep', 'standard', 'keyuser', 'rap', 'cap', 'retire']);
    expect(withRow.md).toContain('Rebuild with key-user tools (configured, no code)');
    const old = decisionMd(project({}, WHOLE, OLD), undefined);
    expect(old.facts.decision.weighing?.rows.map((r) => r.key)).not.toContain('keyuser');
    expect(old.md).not.toContain('Rebuild with key-user tools (configured, no code)');
  });

  test('the page passes the reading only where the signed run’s engine reads key user', () => {
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(page).toContain('...(keyUserGateOpen(project)');
    expect(page).toContain('{ keyUser: evidenceRead.evidence?.keyUser ?? null }');
  });

  // QA review of 317d5f7a9c53, 63537ea20c25: the card promises the step list with its checks; an unbuildable list
  // used to ship a placeholder `key-user-steps.md` instead. Now nothing is downloaded and the strip says why.
  test('a key-user decision without a buildable step list downloads nothing and says why', () => {
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    const guard = page.indexOf("if (isKeyUserDecision(project) && !(keyUserList && keyUserMode !== 'none')) {");
    expect(guard).toBeGreaterThan(-1);
    expect(page.slice(guard, guard + 400)).toMatch(/setBundleError\(`The key-user step list could not be built: [\s\S]*Nothing was downloaded[\s\S]*return;/);
    expect(guard).toBeLessThan(page.indexOf('const zip = new JSZip();'));
    expect(page).not.toContain('Not in this package:');
  });
});

/* ----------------------------------------------------------- 8. the thresholds */

test('8. the key-user thresholds: 20 statements of custom logic, 40 of a list — our rule, not SAP’s', () => {
  expect(KEY_USER_LOGIC_MAX_STATEMENTS).toBe(20);
  expect(KEY_USER_LIST_MAX_STATEMENTS).toBe(40);
  const src = read('lib/abap/key-user-candidates.ts');
  expect(src).toContain("Clean-Core.io takes custom logic to hold (our rule, not SAP's)");
  expect(src).toContain("Clean-Core.io takes a query to express (our rule, not SAP's)");
  // The shipped example stays key user as a whole under the tighter rule.
  expect(listOf().scope).toBe('whole-program');
});

/* ------------------------------------------------------------ 9. the acceptance suite */

test.describe('9. the acceptance suite: a whole key-user program is "no code by decision"', () => {
  test('the key-user example is on the run list, pinned, on the engine’s route', async () => {
    const p = loadPrograms().find((x) => x.id === 'sd-delivery-priority')!;
    expect(p.source.repo).toBe(`public/starter-examples/${EXAMPLE}`);
    expect(p.tracks).toEqual(['rap']);
    expect((await loadSource(p, ROOT)).length).toBeGreaterThan(1000);
  });

  test('the suite’s decision follows the engine: whole → no code, split → code parts, older engine → as before', () => {
    expect(keyUserPlanOf(WHOLE, NEW)).toMatchObject({ mode: 'whole', ranges: null, steps: 4 });
    expect(keyUserPlanOf(SPLIT, NEW).mode).toBe('split');
    expect(keyUserPlanOf(WHOLE, OLD)).toMatchObject({ mode: 'none', ranges: null });
    const suite = read('scripts/acceptance/suite.ts');
    expect(suite).toContain("rec.status = 'no-code-by-decision'");
    expect(suite).toContain("state: 'not-applicable'");
    expect(suite).toContain('keyUser: keyUser.ranges');
  });
});
