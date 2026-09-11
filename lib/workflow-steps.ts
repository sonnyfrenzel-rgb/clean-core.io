import type { Project } from '@/lib/types';

/**
 * The seven phases, and what is actually on record for each.
 *
 * One contract for every view that reports progress: the stepper, the rail, the
 * dashboard row and the delivery page. Before it there were three derivations
 * and they disagreed (roadmap CR-11, E01-F01):
 *
 *   - the stepper counted Upload as a phase of its own, left Economics out, and
 *     ticked every step left of the open page — so opening Testing made Design
 *     and Transformation read as complete whether or not anything existed;
 *   - the rail marked Testing done as soon as cases were *generated*;
 *   - the dashboard read `status`, a string the client writes, and turned "tests
 *     were generated" into "Testing & QA (85%)".
 *
 * `status` is deliberately not read here. Every state below comes from an
 * artefact or a verdict, never from a label a client can set.
 *
 * The order is the roadmap's (§7.0): Analyze includes the upload, and Economics
 * is its own phase rather than a link inside Analyze. The order is orientation,
 * not a waterfall — any phase can be opened at any time.
 */

export type PhaseKey =
  | 'analyze'
  | 'design'
  | 'transformation'
  | 'documentation'
  | 'testing'
  | 'tco'
  | 'delivery';

/**
 * - `empty`   nothing on record for this phase.
 * - `partial` something is on record, but not the evidence the phase asks for:
 *             a staged source nobody analysed, a design nobody confirmed, tests
 *             that were generated and never run, a cost model built on assumed
 *             coefficients.
 * - `done`    the phase's own evidence is on record.
 */
export type PhaseState = 'empty' | 'partial' | 'done';

export interface RailStep {
  /** 1-based position in the canonical order. */
  n: number;
  key: PhaseKey;
  label: string;
  /** Route segment under `/project/{id}/`. */
  path: string;
  state: PhaseState;
  /** `state === 'done'`. Kept because most readers only ask that. */
  done: boolean;
  /** A few words for a badge — "Test draft", "Model estimate". */
  badge: string;
  /** What is on record, in the product's own words. */
  detail: string;
}

export const PHASES: ReadonlyArray<{ n: number; key: PhaseKey; label: string }> = [
  { n: 1, key: 'analyze', label: 'Analyze' },
  { n: 2, key: 'design', label: 'Design' },
  { n: 3, key: 'transformation', label: 'Transformation' },
  { n: 4, key: 'documentation', label: 'Documentation' },
  { n: 5, key: 'testing', label: 'Testing' },
  { n: 6, key: 'tco', label: 'Economics' },
  { n: 7, key: 'delivery', label: 'Delivery' },
];

export interface TestEvidence {
  total: number;
  passed: number;
  failed: number;
  simulated: number;
  /** Generated cases that carry no executed verdict: never run, skipped, pending. */
  withoutVerdict: number;
}

/**
 * Verdicts, counted. Only `Passed` and `Failed` are results of an execution;
 * `Simulated` is a mock and `Not run` / `Pending` / absent are the honest
 * absence of a result.
 */
export function testEvidence(project: Project | null): TestEvidence {
  const cases = Array.isArray(project?.testCases) ? project!.testCases! : [];
  const passed = cases.filter((t) => t?.status === 'Passed').length;
  const failed = cases.filter((t) => t?.status === 'Failed').length;
  const simulated = cases.filter((t) => t?.status === 'Simulated').length;
  return {
    total: cases.length,
    passed,
    failed,
    simulated,
    withoutVerdict: cases.length - passed - failed - simulated,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function workflowSteps(project: Project | null): RailStep[] {
  const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

  const hasCode = has(project?.legacyCode);
  // `activeRunId` is written only by /api/runs/create and is not in the client
  // allowlist. The score comes with the run when the page hydrated it; the
  // dashboard reads bare project documents and may not have one.
  const hasRun = has(project?.activeRunId);
  const score = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const hasDesign = has(project?.solutionDesign);
  const signedOff = project?.approvedByArchitect === true;
  const hasGenerated = has(project?.generatedCode);
  const hasDocs = has(project?.documentation);
  const tests = testEvidence(project);
  const executed = tests.passed + tests.failed;

  const phase = (key: PhaseKey, s: Omit<RailStep, 'n' | 'key' | 'label' | 'path' | 'done'>): RailStep => {
    const p = PHASES.find((x) => x.key === key)!;
    return { n: p.n, key, label: p.label, path: key, done: s.state === 'done', ...s };
  };

  const analyze = hasRun
    ? phase('analyze', {
        state: 'done',
        badge: 'Signed run',
        detail: score !== null ? `Signed run, Clean Core Score ${score}.` : 'Signed run on record.',
      })
    : hasCode
      ? phase('analyze', {
          state: 'partial',
          badge: 'Source staged',
          detail: 'Source staged — no signed run yet, and every later figure derives from one.',
        })
      : phase('analyze', { state: 'empty', badge: 'Not started', detail: 'No source staged yet.' });

  // The design page itself will not move on until the target architecture is
  // confirmed, so a generated design without that confirmation is not a
  // finished phase by the product's own rule.
  const design = !hasDesign
    ? phase('design', { state: 'empty', badge: 'Not started', detail: 'No solution design yet.' })
    : signedOff
      ? phase('design', {
          state: 'done',
          badge: 'Signed off',
          detail: `Design generated; target signed off${project?.approvedBy ? ` by ${project.approvedBy}` : ''} — a self-declaration, not an organisational approval.`,
        })
      : phase('design', {
          state: 'partial',
          badge: 'Awaiting sign-off',
          detail: 'Design generated — the target architecture has not been confirmed.',
        });

  const transformation = hasGenerated
    ? phase('transformation', {
        state: 'done',
        badge: 'Generated',
        detail: 'Target code generated — not compiled or tested.',
      })
    : phase('transformation', { state: 'empty', badge: 'Not started', detail: 'No code generated yet.' });

  const documentation = hasDocs
    ? phase('documentation', { state: 'done', badge: 'Generated', detail: 'Blueprint and BPMN flow generated.' })
    : phase('documentation', { state: 'empty', badge: 'Not started', detail: 'No blueprint generated.' });

  // Generated is not tested. The acceptance for E01-F01-US01 names exactly this
  // case: generated, never-executed tests must read as a draft in every view.
  //
  // "On record" is meant literally. The testing page shows a run's verdicts on
  // screen but does not store them, so a run that happened in someone's browser
  // tab is not evidence the next view can read — and this contract reports what
  // the next view can read. A recorded, attributable run is E07-F02's receipt.
  let testing: RailStep;
  if (tests.total === 0) {
    testing = phase('testing', { state: 'empty', badge: 'Not started', detail: 'No test suite generated.' });
  } else if (tests.passed === tests.total) {
    testing = phase('testing', {
      state: 'done',
      badge: 'Passed',
      detail: `All ${plural(tests.total, 'test case')} returned a pass.`,
    });
  } else if (executed === 0) {
    testing = phase('testing', {
      state: 'partial',
      badge: 'Test draft',
      detail:
        `Test draft: ${plural(tests.total, 'case')} generated, no test run on record.` +
        (tests.simulated > 0 ? ` ${tests.simulated} simulated — a simulation is not a test run.` : ''),
    });
  } else {
    testing = phase('testing', {
      state: 'partial',
      badge: tests.failed > 0 ? 'Failures' : 'Partly run',
      detail: [
        `${tests.passed} of ${tests.total} passed`,
        tests.failed > 0 ? `${tests.failed} failed` : null,
        tests.simulated > 0 ? `${tests.simulated} simulated` : null,
        tests.withoutVerdict > 0 ? `${tests.withoutVerdict} not run` : null,
      ]
        .filter(Boolean)
        .join(', ') + '.',
    });
  }

  // There is nothing in this release that could complete Economics: the model
  // runs on assumed effort coefficients, not on costs anybody observed (CR-23,
  // E12-F02). It is visible, and it says what it is.
  const economics = hasRun
    ? phase('tco', {
        state: 'partial',
        badge: 'Model estimate',
        detail: 'A model estimate from assumed effort coefficients, not observed costs.',
      })
    : phase('tco', {
        state: 'empty',
        badge: 'No baseline',
        detail: 'No signed run — the cost model starts from its Clean Core score.',
      });

  const gaps = [
    !hasGenerated && 'no generated code',
    tests.total === 0 ? 'no test suite' : testing.state !== 'done' ? (tests.failed > 0 ? 'failing tests' : 'tests not run') : null,
    !hasDocs && 'no documentation',
  ].filter(Boolean) as string[];

  const delivery = gaps.length === 0
    ? phase('delivery', {
        state: 'done',
        badge: 'Ready',
        detail: 'Code, documentation and a passing test run are on record. Whether to deploy remains an architect’s decision.',
      })
    : !hasGenerated && tests.total === 0 && !hasDocs
      ? phase('delivery', {
          state: 'empty',
          badge: 'Not started',
          detail: 'Nothing to hand over yet — no code, tests or documentation.',
        })
      : phase('delivery', {
          state: 'partial',
          badge: 'Review only',
          detail: `Review material only: ${gaps.join(', ')}.`,
        });

  return [analyze, design, transformation, documentation, testing, economics, delivery];
}

/**
 * How far along, and where "continue" should go.
 *
 * `next` is the first phase in order that is not done. Economics is passed over
 * for that purpose only: nothing in this release can complete it, and a
 * continue button that parks the reader there for good is not a way forward.
 */
export function workflowSummary(steps: RailStep[]) {
  const doneCount = steps.filter((s) => s.done).length;
  const next =
    steps.find((s) => !s.done && s.key !== 'tco') ?? steps.find((s) => s.key === 'delivery') ?? steps[steps.length - 1];
  return { doneCount, total: steps.length, next };
}
