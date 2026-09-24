import type { Project } from '@/lib/types';
import { artefactDigest, sha256Hex, signOffKey, type TrackedArtefact } from './artefact-digest';
import {
  INPUT_IDS,
  inputLabel,
  invalidatingInputs,
  unverifiedInputs,
  type UnverifiedInput,
} from './input-manifest';
import { coveringTestRunReceipt, executedPasses } from './test-receipt';
import { isEngineDocumentation } from './process-documentation';

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
 * - `stale`   it exists, but was built for a source that is no longer the one
 *             under analysis (E01-F01-US02). Never done, whatever it contains.
 */
export type PhaseState = 'empty' | 'partial' | 'done' | 'stale';

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
  /**
   * The phase is done **and** what makes it done is a record nothing had to take
   * on trust: a server-written signed run, an executed verdict. False for
   * everything a model produced that nothing has checked, and for a
   * self-declaration — both of which are still `done`, because they are on
   * record, and neither of which may be painted green (roadmap 1.7).
   *
   * Kept apart from `done` on purpose. `done` answers "is this phase's own
   * output on record"; `proven` answers "did anything verify it". Merging them
   * would either colour unverified work green or park `workflowSummary().next`
   * on a phase the reader can never finish.
   */
  proven: boolean;
  /** A few words for a badge — "Test draft", "Model estimate". */
  badge: string;
  /** What is on record, in the product's own words. */
  detail: string;
}

/**
 * The one colour rule, read by the stepper, the rail and the dashboard row.
 *
 * Before it each of the three carried its own ladder, and they did not agree:
 * the rail painted the phase you were *looking at* green whatever was on record
 * for it, so opening a phase with nothing in it made the rail report a finished
 * phase while the stepper, two hundred pixels above, showed the same phase grey.
 * Position is not evidence, and it is not a colour here any more — the current
 * phase is marked by a ring and an inner dot in the product's ink, never by the
 * status colour.
 *
 * - `proven`   green. Reserved. See `RailStep.proven`.
 * - `unproven` amber. Something is on record that nothing has verified — an
 *              unconfirmed design, generated code, a generated blueprint, a test
 *              suite nobody ran, a cost model on assumed coefficients.
 * - `stale`    rose. Built for a source that is no longer the one under analysis.
 * - `none`     grey. Nothing on record.
 */
export type PhaseTone = 'proven' | 'unproven' | 'stale' | 'none';

export function phaseTone(step: Pick<RailStep, 'state' | 'proven'>): PhaseTone {
  if (step.state === 'stale') return 'stale';
  if (step.proven) return 'proven';
  return step.state === 'empty' ? 'none' : 'unproven';
}

/**
 * The classes that carry the tone, written out once so the three surfaces
 * cannot drift into four shades of "nearly green". Every shade here is a
 * Tailwind default; half-steps would have to be declared in the `@theme` block
 * of `app/globals.css` first (see CLAUDE.md).
 */
export const PHASE_TONE_CLASS: Record<PhaseTone, { border: string; fill: string; surface: string; ink: string }> = {
  proven: { border: 'border-green-600', fill: 'bg-green-600', surface: 'bg-white', ink: 'text-green-600' },
  unproven: { border: 'border-amber-400', fill: 'bg-amber-400', surface: 'bg-amber-50', ink: 'text-amber-700' },
  stale: { border: 'border-rose-400', fill: 'bg-rose-400', surface: 'bg-rose-50', ink: 'text-rose-700' },
  none: { border: 'border-gray-300', fill: 'bg-gray-200', surface: 'bg-white', ink: 'text-gray-400' },
};

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
  /** Live-tenant checks that reached the system — not tests of the code (E07-F01). */
  connectivity: number;
  /** Generated cases that carry no executed verdict: never run, skipped, todo, pending, errored. */
  withoutVerdict: number;
  /**
   * How many cases an attributable execution reports as passed — counted from
   * the server-written receipt of `/api/run-tests`, never from the project's own
   * `status` strings (QA full review of a19945ef01dc, E07-F02).
   *
   * `passed` above is what the *screen* shows, and `firestore.rules` lets the
   * owner write it. This is what the phase contract is allowed to call proven.
   * It is `0` on every project without a receipt that still fits what is on it,
   * which is the conservative direction: no record, no execution.
   */
  attestedPasses: number;
}

/**
 * Verdicts, counted. Only `Passed` and `Failed` are results of an execution;
 * `Simulated` is a mock, `Connectivity` a tenant that answered, and `Not run`,
 * `Skipped`, `Todo`, `Pending`, `Error` or absent are the honest absence of a
 * result.
 */
export function testEvidence(project: Project | null): TestEvidence {
  const cases = Array.isArray(project?.testCases) ? project!.testCases! : [];
  const passed = cases.filter((t) => t?.status === 'Passed').length;
  const failed = cases.filter((t) => t?.status === 'Failed').length;
  const simulated = cases.filter((t) => t?.status === 'Simulated').length;
  const connectivity = cases.filter((t) => t?.status === 'Connectivity').length;
  return {
    total: cases.length,
    passed,
    failed,
    simulated,
    connectivity,
    withoutVerdict: cases.length - passed - failed - simulated - connectivity,
    attestedPasses: executedPasses(
      coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0]),
      cases.map((t) => String(t?.id ?? '')),
    ),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface Staleness {
  /** The source on the project is not the one the active signed run analysed. */
  sourceChanged: boolean;
  design: boolean;
  code: boolean;
  tests: boolean;
  docs: boolean;
  /** The standing architect sign-off was given for a previous source. */
  signOff: boolean;
  /**
   * Inputs of the active run that cannot be shown to still match (roadmap 0.6).
   * Empty on a run signed before the input manifest existed — there is nothing
   * recorded to compare, and that case is reported rather than guessed at.
   */
  unverifiedInputs: UnverifiedInput[];
}

/**
 * What was built for a source that is no longer the one under analysis.
 *
 * Two independent checks, both from server-written values, neither from
 * `status`:
 *
 *   - the source itself: SHA-256 of `legacyCode` against the digest the active
 *     run signed. They can only differ if something wrote the source without a
 *     new run — the analyze page never does, a direct write could.
 *   - everything built on it: `/api/runs/create` records the digests of the
 *     design, code, tests, documentation and the sign-off as they stood when the
 *     source changed (`auditMetadata.sourceChange`). An artefact still carrying
 *     its recorded digest has not been touched since, so it was built for the
 *     previous source. Regenerating it is what clears it — there is no flag to
 *     flip, and `auditMetadata` is not client-writable.
 *
 * When the source itself changed, everything downstream is stale with it: every
 * artefact was produced against an analysis of different code.
 */
export function staleness(project: Project | null): Staleness {
  const none: Staleness = {
    sourceChanged: false, design: false, code: false, tests: false, docs: false, signOff: false, unverifiedInputs: [],
  };
  if (!project) return none;

  const analysed =
    project.auditMetadata?.inputFingerprint?.sha256 ??
    (project as { inputFingerprint?: { sha256?: string } }).inputFingerprint?.sha256;
  const source = typeof project.legacyCode === 'string' && project.legacyCode.trim() ? project.legacyCode : null;
  const sourceChanged = Boolean(project.activeRunId && analysed && source && sha256Hex(source) !== analysed);

  const record = project.auditMetadata?.sourceChange;
  const unchangedSince = (key: TrackedArtefact) => {
    const was = record?.artefacts?.[key];
    return Boolean(was) && artefactDigest(key, (project as unknown as Record<string, unknown>)[key]) === was;
  };
  const signOffUnchanged = Boolean(
    project.approvedByArchitect === true && record?.signOff && signOffKey(project.architectSignOffAt) === record.signOff,
  );

  // Roadmap 0.6 — the manifest comparison that replaces the freshness heuristic.
  //
  // The two checks above ask whether anything positively proves a result old and,
  // finding nothing, call it current. This one asks the other question: of the
  // inputs the signed run recorded, which can still be shown to be the inputs
  // that are there now? An input that differs, one this reader cannot read, and
  // one the run never recorded all come back as unverified, and none of them
  // comes back as current.
  //
  // The browser can recompute two of the six: the source and the deployment
  // target. The other four — catalog, rule set, engine build, narrative model —
  // are the server's to compare, and `/api/audit-pack/create` does exactly that
  // before it signs anything.
  const recorded = project.inputManifest ?? project.auditMetadata?.inputManifest ?? null;
  const deployment = typeof project.s4Deployment === 'string' && project.s4Deployment ? project.s4Deployment : null;
  const unverified =
    project.activeRunId && recorded
      ? invalidatingInputs(
          unverifiedInputs(recorded, {
            [INPUT_IDS.source]: source ? sha256Hex(source) : null,
            [INPUT_IDS.deployment]: deployment ? sha256Hex(deployment) : null,
          }),
        )
      : [];

  return {
    sourceChanged,
    design: sourceChanged || unchangedSince('solutionDesign'),
    code: sourceChanged || unchangedSince('generatedCode'),
    tests: sourceChanged || unchangedSince('testCases'),
    docs: sourceChanged || unchangedSince('documentation'),
    signOff: (sourceChanged && project.approvedByArchitect === true) || signOffUnchanged,
    unverifiedInputs: unverified,
  };
}

/** "the analysed source and the target deployment" — for a blocker sentence. */
function inputList(unverified: ReadonlyArray<UnverifiedInput>): string {
  const labels = unverified.map((u) => inputLabel(u.id));
  if (labels.length <= 1) return labels[0] || '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

const present = (project: Project | null) => {
  const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return {
    design: has(project?.solutionDesign),
    code: has(project?.generatedCode),
    tests: Array.isArray(project?.testCases) && project!.testCases!.length > 0,
    docs: has(project?.documentation),
  };
};

/**
 * Why a controlled handover has to wait — each entry names what was built for a
 * previous source. Empty when nothing blocks it. The delivery page disables its
 * downloads on a non-empty list; `/api/audit-pack/create` enforces its own part
 * server-side.
 */
export function handoverBlockers(project: Project | null): string[] {
  const s = staleness(project);
  const p = present(project);
  const out: string[] = [];
  if (s.sourceChanged) out.push('the analysis (the source changed after the signed run)');
  else if (s.unverifiedInputs.length > 0) {
    out.push(`the analysis (${inputList(s.unverifiedInputs)} cannot be shown to be what the signed run used)`);
  }
  if (s.design && p.design) out.push('the solution design');
  if (s.signOff) out.push('the architecture sign-off');
  if (s.code && p.code) out.push('the generated code');
  if (s.tests && p.tests) out.push('the test suite');
  if (s.docs && p.docs) out.push('the documentation');
  return out;
}

/**
 * Why generating `target` now would build on a previous source. Transformation
 * needs a current design and sign-off; documentation and testing also need
 * current code. The pages refuse to generate on a non-empty list, so a stale
 * state cannot be laundered into a fresh-looking artefact built on top of it.
 */
export function generationBlockers(
  project: Project | null,
  target: 'transformation' | 'documentation' | 'testing',
): string[] {
  const s = staleness(project);
  const p = present(project);
  const out: string[] = [];
  if (s.sourceChanged) return ['The source changed after the signed run. Re-run the analysis in stage 1 first.'];
  if (s.unverifiedInputs.length > 0) {
    return [
      `The signed run's inputs cannot all be shown to still match — ${inputList(s.unverifiedInputs)}. Re-run the analysis in stage 1 first.`,
    ];
  }
  if (s.design && p.design) out.push('The solution design was generated for a previous source. Regenerate it in stage 2 first.');
  if (s.signOff) out.push('The architecture sign-off was given for a previous source. Confirm it again in stage 2.');
  if (target !== 'transformation' && s.code && p.code) {
    out.push('The code was generated from a previous source. Regenerate it in stage 3 first.');
  }
  return out;
}

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

  // `proven` is opt-in and can only ever be true on a `done` phase: a phase that
  // forgets to claim it is amber, which is the safe direction. Roadmap 1.7.
  type PhaseFacts = Omit<RailStep, 'n' | 'key' | 'label' | 'path' | 'done' | 'proven'> & { proven?: boolean };
  const phase = (key: PhaseKey, s: PhaseFacts): RailStep => {
    const p = PHASES.find((x) => x.key === key)!;
    return {
      n: p.n,
      key,
      label: p.label,
      path: key,
      state: s.state,
      badge: s.badge,
      detail: s.detail,
      done: s.state === 'done',
      proven: s.state === 'done' && s.proven === true,
    };
  };

  // Proven: `activeRunId` is written only by `/api/runs/create`, is not in the
  // client allowlist, and the run it points at is canonical-JSON signed.
  //
  // Not when the run could not be read (roadmap 3.0.2). `loadProjectAndHydrate`
  // marks a project whose `activeRunId` names a run it could not load — gone,
  // or refused by the rules — and the id alone proves nothing: the signature is
  // on the run, and the run is not here. It is a run on record whose content is
  // not determined, which is amber and says so, never the green of a signature
  // nobody checked.
  const runUnreadable = hasRun && project?._runLoadFailed === true;
  const analyze = runUnreadable
    ? phase('analyze', {
        state: 'partial',
        badge: 'Run unreadable',
        detail: 'A signed run is on record and could not be read — its score and findings are not determined.',
      })
    : hasRun
    ? phase('analyze', {
        state: 'done',
        proven: true,
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
  //
  // Not proven even when it is signed off: the design is the model's text, and
  // the sign-off is the signed-in account saying so about itself. The audit pack
  // puts both in `07-user-attested.md`, "not covered by the signature" — so the
  // colour here says the same thing the export says.
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

  // Done, never proven: the detail says "not compiled or tested" and the colour
  // now says it too. This is the model's output with nothing checking it.
  const transformation = hasGenerated
    ? phase('transformation', {
        state: 'done',
        badge: 'Generated',
        detail: 'Target code generated — not compiled or tested.',
      })
    : phase('transformation', { state: 'empty', badge: 'Not started', detail: 'No code generated yet.' });

  // Roadmap 3.0.5 — two forms can be on record. The engine's document is read
  // out of the code with every statement anchored; it is still done and not
  // proven, because nobody has confirmed the reading. A blueprint a model wrote
  // before 3.0.5 stays done too — it is not migrated or taken away — and the
  // detail says what it is and how to replace it.
  const documentation = !hasDocs
    ? phase('documentation', { state: 'empty', badge: 'Not started', detail: 'No blueprint generated.' })
    : isEngineDocumentation(project?.documentation)
      ? phase('documentation', { state: 'done', badge: 'Read from code', detail: 'Process documentation read from the code — every statement with its lines.' })
      : phase('documentation', { state: 'done', badge: 'Generated', detail: 'Earlier model-written blueprint on record — read it again from the code.' });

  // Generated is not tested. The acceptance for E01-F01-US01 names exactly this
  // case: generated, never-executed tests must read as a draft in every view.
  //
  // "On record" is meant literally, and since the QA full review of a19945ef01dc
  // it is meant about a record a client cannot write. `testCases[].status` is in
  // the client allowlist of `firestore.rules`, so a stored `Passed` can equally
  // have come from a browser or from a model that invented the key, and it used
  // to be enough to paint Testing green and unlock Delivery. The verdict that
  // counts is `/api/run-tests`'s receipt (E07-F02, `lib/test-receipt.ts`):
  // server-written, bound to the active run and to the digests of the code, the
  // suite and the case list.
  //
  // The route writes the runner's verdicts onto `testCases` as well (roadmap
  // 7.3, `applyRunnerVerdicts`), so after a real run the two agree and the
  // screen shows what the receipt says. The strings on their own are still not
  // the record — they are what a reader may annotate — which is why the proven
  // branch asks for both and the branch under it exists at all.
  let testing: RailStep;
  if (tests.total === 0) {
    testing = phase('testing', { state: 'empty', badge: 'Not started', detail: 'No test suite generated.' });
  } else if (tests.passed === tests.total && tests.attestedPasses === tests.total) {
    // Proven: every case carries a verdict that is the result of an execution,
    // and an attributable run reported that execution. `testEvidence` refuses to
    // count `Simulated` or `Connectivity` as one.
    testing = phase('testing', {
      state: 'done',
      proven: true,
      badge: 'Passed',
      detail: `All ${plural(tests.total, 'test case')} returned a pass in a recorded run.`,
    });
  } else if (tests.passed === tests.total) {
    // Every case says it passed, and no execution on record says so. Still
    // `done` — a verdict is on the project and the phase's own output exists —
    // and never green: `proven` is what "something checked it" means here.
    testing = phase('testing', {
      state: 'done',
      badge: 'Self-reported',
      detail:
        `All ${plural(tests.total, 'test case')} are marked as passed, and no test run is on record for this code. ` +
        'Run the suite in stage 5 to record one.',
    });
  } else if (executed === 0) {
    testing = phase('testing', {
      state: 'partial',
      badge: 'Test draft',
      detail:
        `Test draft: ${plural(tests.total, 'case')} generated, no test run on record.` +
        (tests.simulated > 0 ? ` ${tests.simulated} simulated — a simulation is not a test run.` : '') +
        (tests.connectivity > 0 ? ` ${tests.connectivity} connectivity checks reached the tenant — not tests of the code.` : ''),
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
  const economics = runUnreadable
    ? phase('tco', {
        state: 'empty',
        badge: 'No baseline',
        detail: 'The signed run could not be read — the cost model has no Clean Core score to start from.',
      })
    : hasRun
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

  // The one place where generated work earns green, and only because something
  // checked it: `gaps` is empty exactly when every generated case carries an
  // executed pass over the generated code. Transformation on its own never does.
  //
  // Green here is `testing.proven`, not `testing.done`. Delivery used to read
  // `gaps`, `gaps` read `testing.state`, and `testing.state` was `done` on
  // client-written verdicts — so a row of `Passed` strings a browser put on the
  // project produced "Ready", in green, under the sentence "a passing test run
  // is on record" (QA full review of a19945ef01dc). The material can be complete
  // and the run still not have happened; those are two statements and they now
  // read as two.
  const delivery = gaps.length === 0
    ? phase('delivery', {
        state: 'done',
        proven: testing.proven,
        badge: testing.proven ? 'Ready' : 'Unverified',
        detail: testing.proven
          ? 'Code, documentation and a passing test run are on record. Whether to deploy remains an architect’s decision.'
          : 'Code, documentation and test verdicts are on record — no test run is on record behind the verdicts. Run the suite in stage 5 before handing this over.',
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

  // Staleness overrides whatever the artefact would otherwise count as. A design
  // that is complete and signed off, for code that is no longer the code under
  // review, is not a finished design — it is the thing US02 exists to stop
  // someone approving.
  const s = staleness(project);
  const blockers = handoverBlockers(project);
  const stale = (base: RailStep, detail: string, badge = 'Stale'): RailStep => ({
    ...base,
    state: 'stale',
    done: false,
    proven: false,
    badge,
    detail,
  });

  return [
    hasRun && s.sourceChanged
      ? stale(analyze, 'The source on this project is not the one the signed run analysed — re-run the analysis.', 'Source changed')
      : hasRun && s.unverifiedInputs.length > 0
        ? stale(
            analyze,
            `The signed run's inputs cannot all be shown to still match — ${inputList(s.unverifiedInputs)}. Re-run the analysis.`,
            'Inputs changed',
          )
        : analyze,
    hasDesign && s.design
      ? stale(design, 'Designed for a previous source — regenerate it against the current analysis.')
      : hasDesign && s.signOff
        ? { ...design, state: 'partial', done: false, proven: false, badge: 'Re-confirm', detail: 'The sign-off was given for a previous source — confirm the target architecture again.' }
        : design,
    hasGenerated && s.code
      ? stale(transformation, 'Generated from a previous source — regenerate it once the design is current.')
      : transformation,
    hasDocs && s.docs ? stale(documentation, 'Written for a previous source — regenerate it.') : documentation,
    tests.total > 0 && s.tests ? stale(testing, 'Test cases written for a previous source — regenerate the suite.') : testing,
    hasRun && (s.sourceChanged || s.unverifiedInputs.length > 0)
      ? stale(economics, 'Modelled on the score of a different source — re-run the analysis.')
      : economics,
    blockers.length > 0
      ? stale(delivery, `Handover blocked — built for a previous source: ${blockers.join(', ')}.`, 'Blocked')
      : delivery,
  ];
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
