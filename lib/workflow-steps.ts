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
import { PROFILE_INPUT_ID } from './assessment-profile';
import { liveProfileDigest, recordedProfileOf } from './assessment-target';
import { outsideCountsLine, outsideReading, outsideShortfall, type OutsideKind } from './sap-test-results';

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
 *             under analysis (E01-F01-US02), or with no signed analysis on
 *             record at all (a project from before the trust chain). Never
 *             done, whatever it contains.
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
  /**
   * `proven` rests on an execution against mocks — the test sandbox — and not
   * on a real system. The record is still the server's, so the gates that ask
   * "did an execution happen" read `proven`; what the reader is shown is
   * *Demonstrated · mock* (DESIGN.md §4, `lib/provenance.ts`) in the warning
   * tone, never green and never *Proven* (codex code-trust-04). False whenever
   * `proven` is.
   */
  mock: boolean;
  /**
   * The phase is `done` on a result from the reader's own SAP system, not on an
   * execution here (ADR-075, owner 03.10.2026): `imported` from an ABAP Unit
   * result file, or `confirmed` by the signed-in account — a self-declaration.
   * Only the testing phase (and the delivery phase that rests on it) sets it,
   * only on the ABAP Cloud route, where nothing here runs the suite.
   *
   * Kept beside `proven` and never folded into it: `proven` means an execution
   * happened here, and this is the record of one that happened elsewhere. It
   * is `done`, never green, and `null` whenever the phase is not `done`.
   */
  verifiedOutside: OutsideKind | null;
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

export function phaseTone(step: Pick<RailStep, 'state' | 'proven'> & { mock?: boolean }): PhaseTone {
  if (step.state === 'stale') return 'stale';
  if (step.proven && !step.mock) return 'proven';
  return step.state === 'empty' ? 'none' : 'unproven';
}

/**
 * The classes that carry the tone, written out once so the three surfaces
 * cannot drift into four shades of "nearly green". Tokens only (`DESIGN.md`
 * §1.1, block D step D.29): green is `--cc-success` and belongs to `proven`
 * alone; done-but-unchecked and stale are both `warning` — *stale* means
 * "recompute", which is `warning` and never `error` ("Stale is not
 * wrong"); stale takes the darker ink of that family so the two stay apart
 * beside each other, and the tick and the `data-phase-tone` say which is which
 * in words. An empty phase is the neutral line.
 */
export const PHASE_TONE_CLASS: Record<PhaseTone, { border: string; fill: string; surface: string; ink: string }> = {
  proven: { border: 'border-cc-success', fill: 'bg-cc-success', surface: 'bg-cc-surface', ink: 'text-cc-success' },
  unproven: { border: 'border-cc-warning-line', fill: 'bg-cc-warning-line', surface: 'bg-cc-warning-bg', ink: 'text-cc-warning' },
  stale: { border: 'border-cc-warning', fill: 'bg-cc-warning-mark', surface: 'bg-cc-warning-bg', ink: 'text-cc-warning' },
  none: { border: 'border-cc-neutral-border', fill: 'bg-cc-line', surface: 'bg-cc-surface', ink: 'text-cc-ink-muted' },
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

/**
 * What each tool is for, in one short line — the one source the tools bar, its
 * phone menu and every "which tool, when" hint read (owner 03.10.2026: "a
 * completely clear path … and how he uses the tools"). A purpose, not a state:
 * it never says what is on record, so it cannot disagree with `workflowSteps`.
 */
export const PHASE_PURPOSE: Readonly<Record<PhaseKey, string>> = Object.freeze({
  analyze: 'Reads the code and signs a run — every other figure starts here.',
  design: 'Chooses the target architecture. Opening it writes the solution design once with the model, where it is on — not counted against your analysis runs.',
  transformation: 'Generates the target code.',
  documentation: 'Writes the process documentation: SOP and RACI.',
  testing: 'Prepares and runs the test cases.',
  tco: 'Compares the costs, as a simulation on your own figures.',
  delivery: 'Hands the package over.',
});

/**
 * Whether a tool has something of its own on record for this project (ADR-060,
 * amended by the owner on 03.10.2026: "green check on Analyze, and 'Run the
 * analysis' as the next step — a contradiction"). Since the second amendment
 * of the same day ("a check must mean done") the green check is a `done` phase
 * alone, and this decides the *started* mark of a `partial` one
 * (`toolMark` in `lib/workspace-model.ts`).
 *
 * `done` always counts. `partial` counts only where the partial record is the
 * tool's own output — a generated design waiting for its sign-off, a test
 * draft nobody ran. It does not count for three phases whose `partial` says
 * something about *other* inputs:
 *
 *   - Analyze `partial` is a staged source (or a run that could not be read) —
 *     an upload, not an analysis. Its check means a signed run.
 *   - Economics `partial` is "the signed run is the baseline"; nothing records
 *     whether a cost estimate was ever made (the figures are not stored).
 *   - Delivery `partial` is "review material only" — other tools' output;
 *     nothing was handed over.
 *
 * A visit is never a record: nothing here reads where the reader has been.
 */
export function toolOnRecord(step: { key: PhaseKey; state: PhaseState }): boolean {
  if (step.state === 'done') return true;
  if (step.state !== 'partial') return false;
  return step.key !== 'analyze' && step.key !== 'tco' && step.key !== 'delivery';
}

/**
 * The phase the product recommends next, or `null` once nothing is open — the
 * rule of `workflowSummary` (Economics passed over, because nothing in this
 * release can complete it) for any rail, the demo's included.
 */
export function nextPhaseKey(steps: ReadonlyArray<{ key: PhaseKey; state: PhaseState }>): PhaseKey | null {
  const open = steps.find((s) => s.state !== 'done' && s.key !== 'tco');
  if (open) return open.key;
  return null;
}

/**
 * Why a tool cannot do anything yet, or `null` when it can. Only one reason is
 * stated, and only the one this contract can see: without a signed run every
 * later tool has nothing to work from (`enforceActiveRun`). The tool stays
 * reachable; the sentence says what it will need.
 */
export function phaseNeeds(
  step: { key: PhaseKey; state: PhaseState },
  steps: ReadonlyArray<{ key: PhaseKey; state: PhaseState }>,
): string | null {
  if (step.key === 'analyze' || step.state !== 'empty') return null;
  const analyze = steps.find((s) => s.key === 'analyze');
  if (analyze && analyze.state === 'done') return null;
  return 'Needs a signed run first.';
}

/**
 * What pressing the way into a phase starts — "Run the analysis", "Draft the
 * design". One wording for every place that offers the next step: the list
 * report, "Next step" in every view, and the Management decision panel.
 */
export function phaseActionLabel(step: { key: PhaseKey; state: PhaseState; label: string }, hasSource: boolean): string {
  if (step.key === 'analyze') {
    if (!hasSource) return 'Upload the code';
    return step.state === 'stale' ? 'Run the analysis again' : 'Run the analysis';
  }
  if (step.state === 'stale') return `Bring ${step.label} up to date`;
  const started = step.state === 'partial';
  switch (step.key) {
    case 'design':
      return started ? 'Confirm the design' : 'Draft the design';
    case 'transformation':
      return started ? 'Review the generated code' : 'Generate the code';
    case 'documentation':
      return started ? 'Review the documentation' : 'Write the documentation';
    case 'testing':
      return started ? 'Run the tests' : 'Prepare the tests';
    case 'tco':
      return 'Estimate the costs';
    case 'delivery':
      return 'Hand over the package';
    default:
      return `Open ${step.label}`;
  }
}

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
  /**
   * The same, for failures: how many cases the covering receipt reports as
   * failed. `failed` above counts `status` strings the owner can write, so a
   * `Failures` badge on it alone reported an execution nobody recorded (QA full
   * review of v2.20.0).
   */
  attestedFailures: number;
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
  const receipt = coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0]);
  const ids = cases.map((t) => String(t?.id ?? ''));
  const failedInReceipt = new Set((receipt?.verdicts ?? []).filter((v) => v.status === 'Failed').map((v) => v.id));
  return {
    total: cases.length,
    passed,
    failed,
    simulated,
    connectivity,
    withoutVerdict: cases.length - passed - failed - simulated - connectivity,
    attestedPasses: executedPasses(receipt, ids),
    attestedFailures: [...new Set(ids)].filter((id) => failedInReceipt.has(id)).length,
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
   * Roadmap 7.10 - what moved: the source, or (same source) the target
   * profile. `'profile'` when the change record says so (`reason: 'profile'`)
   * or the project's profile no longer matches the run's. Only the wording
   * reads it; what is stale is decided above, the same way for both.
   */
  basis: 'source' | 'profile';
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
    sourceChanged: false, design: false, code: false, tests: false, docs: false, signOff: false, basis: 'source', unverifiedInputs: [],
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
  // Roadmap 7.10 - the profile, for a run that recorded one: rebuilt from what
  // the project states now against the run's own catalog snapshot and rule
  // version (the catalog is the server's to compare). A run signed before 7.10
  // is not asked about a profile it never recorded.
  const recordedProfile = recordedProfileOf(project);
  const unverified =
    project.activeRunId && recorded
      ? invalidatingInputs(
          unverifiedInputs(recorded, {
            [INPUT_IDS.source]: source ? sha256Hex(source) : null,
            [INPUT_IDS.deployment]: deployment ? sha256Hex(deployment) : null,
            ...(recordedProfile ? { [PROFILE_INPUT_ID]: liveProfileDigest({ project, recorded: recordedProfile }) } : {}),
          }),
        )
      : [];
  // A sign-off given under one target profile is not a sign-off under another.
  const profileMoved = unverified.some((u) => u.id === PROFILE_INPUT_ID);

  return {
    sourceChanged,
    design: sourceChanged || unchangedSince('solutionDesign'),
    code: sourceChanged || unchangedSince('generatedCode'),
    tests: sourceChanged || unchangedSince('testCases'),
    docs: sourceChanged || unchangedSince('documentation'),
    signOff: ((sourceChanged || profileMoved) && project.approvedByArchitect === true) || signOffUnchanged,
    basis: !sourceChanged && (profileMoved || record?.reason === 'profile') ? 'profile' : 'source',
    unverifiedInputs: unverified,
  };
}

/**
 * "a previous source" or "a previous target profile" - the phrase every stale
 * sentence uses, so a profile change is not described as a source change.
 */
export function previousBasis(project: Project | null): string {
  return staleness(project).basis === 'profile' ? 'a previous target profile' : 'a previous source';
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
    code: hasGeneratedPackage(project?.generatedCode),
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
  const prev = s.basis === 'profile' ? 'a previous target profile' : 'a previous source';
  if (s.design && p.design) out.push(`The solution design was generated for ${prev}. Regenerate it in stage 2 first.`);
  if (s.signOff) out.push(`The architecture sign-off was given for ${prev}. Confirm it again in stage 2.`);
  if (target !== 'transformation' && s.code && p.code) {
    out.push(`The code was generated from ${prev}. Regenerate it in stage 3 first.`);
  }
  return out;
}

/** One thing a generation needs that is not on record yet, and the one action that puts it there. */
export interface GenerationPrerequisite {
  id: 'source' | 'run' | 'design' | 'code';
  /** A sentence the page shows as text next to its button — never only as a hover title. */
  reason: string;
  /** The stage whose page resolves it, and the words on the link there. */
  action: { label: string; stage: PhaseKey };
}

/**
 * What has to be on record before `target` can be generated at all. The sibling
 * of `generationBlockers`, which covers the other case — something on record
 * that was built for a previous source.
 *
 * Owner report 03.10.2026: Transformation's button was enabled on a
 * project with no solution design, its click checked for the design and
 * returned without a word, and `generationBlockers` was empty because nothing
 * was stale. A page shows each entry with its action and keeps its button
 * disabled while the list is not empty.
 *
 * The analysis narrative is not a prerequisite of anything here. Since 03.10.2026
 * (coordinator decision 03.10.2026) the Design stage writes its design from the
 * signed engine evidence — route, process, rules, SAP objects — and uses a
 * narrative only as further context where the run has one, so an engine-only
 * run (`/api/runs/create` stores an empty string) leads to Design like any
 * other. `design` itself needs a source and a signed run; whether a model can
 * be called is the stage's own availability, said beside its button.
 *
 * Documentation reads its process from the code without a model and states
 * its own preconditions, so for it only a missing source counts here.
 */
export function generationPrerequisites(
  project: Project | null,
  target: 'design' | 'transformation' | 'documentation' | 'testing',
): GenerationPrerequisite[] {
  if (!project) return [];
  const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  if (!has(project.legacyCode)) {
    return [{
      id: 'source',
      reason: 'There is no ABAP source on this project yet.',
      action: { label: 'Open Analyze', stage: 'analyze' },
    }];
  }
  if (target === 'design') {
    return has(project.activeRunId)
      ? []
      : [{
          id: 'run',
          reason: 'There is no signed analysis run yet. The design is written from the evidence the run signs.',
          action: { label: 'Run the analysis', stage: 'analyze' },
        }];
  }
  const out: GenerationPrerequisite[] = [];
  if (target !== 'documentation' && !has(project.solutionDesign)) {
    out.push({
      id: 'design',
      reason: 'No solution design yet. The code is generated from the design, so generate and review it in Design first.',
      action: { label: 'Open Design', stage: 'design' },
    });
  }
  if (target === 'testing' && !hasGeneratedPackage(project.generatedCode)) {
    out.push({
      id: 'code',
      reason: 'No generated code yet. The scenarios are written from the target code.',
      action: { label: 'Open Transformation', stage: 'transformation' },
    });
  }
  return out;
}

/**
 * Whether `generatedCode` holds code. A non-empty string was enough, so a
 * serialised package with no files — `'[]'` — marked Transformation generated
 * and let Delivery count code that was not there (QA full review of v2.20.0).
 * A package counts once it has one file with a path and content; a string that
 * is not a JSON array is the flat source of a project from before packages,
 * and counts as it always did.
 */
function hasGeneratedPackage(code: unknown): boolean {
  if (typeof code !== 'string' || code.trim().length === 0) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    return true;
  }
  if (!Array.isArray(parsed)) return true;
  return parsed.some(
    (f) =>
      !!f &&
      typeof f === 'object' &&
      typeof (f as { path?: unknown }).path === 'string' &&
      typeof (f as { content?: unknown }).content === 'string',
  );
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
  const hasGenerated = hasGeneratedPackage(project?.generatedCode);
  const hasDocs = has(project?.documentation);
  const tests = testEvidence(project);
  const executed = tests.passed + tests.failed;
  // Every receipt `/api/run-tests` writes today is the sandbox's
  // (`TestRunReceipt.environment` is always `mock`); asked, not assumed, so a
  // live run, once there is one, is not called a mock.
  const mockRun = coveringTestRunReceipt(project as Parameters<typeof coveringTestRunReceipt>[0])?.environment === 'mock';

  // `proven` is opt-in and can only ever be true on a `done` phase: a phase that
  // forgets to claim it is amber, which is the safe direction. Roadmap 1.7.
  type PhaseFacts = Omit<RailStep, 'n' | 'key' | 'label' | 'path' | 'done' | 'proven' | 'mock' | 'verifiedOutside'> & {
    proven?: boolean;
    mock?: boolean;
    verifiedOutside?: OutsideKind | null;
  };
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
      mock: s.state === 'done' && s.proven === true && s.mock === true,
      verifiedOutside: s.state === 'done' && s.proven !== true ? s.verifiedOutside ?? null : null,
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
      ? // The marker that makes a document "the engine's" sits on the project
        // document, which the browser can write, so the badge cannot say the
        // engine wrote it — only that a document in the engine's form is on record.
        phase('documentation', { state: 'done', badge: 'On record', detail: 'Process documentation in the engine’s form is on record. It is stored where the browser can write it, so this does not prove the engine wrote it — read it again from the code to be sure.' })
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
  // ADR-075 — on the ABAP Cloud route the suite runs only in the reader's own
  // SAP system, so its result comes from there: an imported result file or the
  // account's confirmation, server-written and bound to the run, code, test
  // class and scenario list it was given for (`lib/sap-test-results.ts`).
  const outside = outsideReading(project);
  let testing: RailStep;
  if (tests.total === 0) {
    testing = phase('testing', { state: 'empty', badge: 'Not started', detail: 'No test suite generated.' });
  } else if (outside.state === 'current') {
    const s = outside.summary;
    const counts = outsideCountsLine(s);
    testing = outside.verifies
      ? phase('testing', {
          state: 'done',
          verifiedOutside: s.kind,
          badge: s.kind === 'imported' ? 'Imported · passed' : 'Confirmed by you',
          detail:
            s.kind === 'imported'
              ? `${counts} in your SAP system — imported from an ABAP Unit result file. Not run here.`
              : `You confirmed ${counts} in your SAP system, run on ${s.ranOn} — a self-declaration. Not run here.`,
        })
      : phase('testing', {
          state: 'partial',
          badge: s.failed > 0 || (s.coverage?.failed ?? 0) > 0 ? 'Failures · your system' : 'Incomplete',
          detail:
            (s.kind === 'imported'
              ? `Imported from your SAP system: ${counts}.`
              : `You confirmed ${counts} in your SAP system, run on ${s.ranOn}.`) +
            ` ${outsideShortfall(s)} Record a passing run to hand over.`,
        });
  } else if (tests.passed === tests.total && tests.attestedPasses === tests.total) {
    // Proven: every case carries a verdict that is the result of an execution,
    // and an attributable run reported that execution. `testEvidence` refuses to
    // count `Simulated` or `Connectivity` as one.
    testing = phase('testing', {
      state: 'done',
      proven: true,
      mock: mockRun,
      badge: mockRun ? 'Passed · mock' : 'Passed',
      detail: mockRun
        ? `All ${plural(tests.total, 'test case')} returned a pass in a recorded sandbox run against mocks — not against an SAP system.`
        : `All ${plural(tests.total, 'test case')} returned a pass in a recorded run.`,
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
        (tests.connectivity > 0 ? ` ${tests.connectivity} connectivity checks reached the tenant — not tests of the code.` : '') +
        (outside.state === 'earlier'
          ? ' A result from your SAP system is on record for an earlier run, code, test class or scenario list — record it again.'
          : ''),
    });
  } else {
    testing = phase('testing', {
      state: 'partial',
      // A failure on the case list alone is the owner's label, as a pass is
      // above: `Failures` is for failures a recorded run reported.
      badge: tests.attestedFailures > 0 ? 'Failures' : tests.failed > 0 ? 'Self-reported' : 'Partly run',
      detail: [
        `${tests.passed} of ${tests.total} passed`,
        tests.failed > 0
          ? tests.attestedFailures > 0
            ? `${tests.failed} failed`
            : `${tests.failed} marked as failed with no test run on record`
          : null,
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
        // The run is the baseline, not an estimate: the cost figures are
        // entered on the Economics stage and not stored, so nothing here knows
        // whether an estimate was ever computed (QA full review of v2.20.0).
        detail: 'The signed run is the baseline. An estimate needs your cost figures and uses assumed effort coefficients, not observed costs.',
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
        mock: testing.mock,
        verifiedOutside: testing.verifiedOutside,
        badge: testing.proven
          ? (testing.mock ? 'Ready · mock tests' : 'Ready')
          : testing.verifiedOutside === 'imported'
            ? 'Ready · imported tests'
            : testing.verifiedOutside === 'confirmed'
              ? 'Ready · confirmed tests'
              : 'Unverified',
        detail: testing.mock
          ? 'Code, documentation and a passing sandbox test run against mocks are on record — not a run against an SAP system. Whether to deploy remains an architect’s decision.'
          : testing.proven
          ? 'Code, documentation and a passing test run are on record. Whether to deploy remains an architect’s decision.'
          : testing.verifiedOutside === 'imported'
          ? 'Code, documentation and a passing ABAP Unit run imported from your SAP system are on record — run there, not here. Whether to deploy remains an architect’s decision.'
          : testing.verifiedOutside === 'confirmed'
          ? 'Code, documentation and your confirmation that the ABAP Unit class passed in your SAP system are on record — a self-declaration, not a run here. Whether to deploy remains an architect’s decision.'
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
  const prevBasis = s.basis === 'profile' ? 'a previous target profile' : 'a previous source';
  const blockers = handoverBlockers(project);
  const stale = (base: RailStep, detail: string, badge = 'Stale'): RailStep => ({
    ...base,
    state: 'stale',
    done: false,
    proven: false,
    mock: false,
    verifiedOutside: null,
    badge,
    detail,
  });

  // No signed analysis, and yet a design, code, documentation or tests on
  // record (owner feedback 02.10.2026). Every downstream page refuses to work
  // without a run (`enforceActiveRun`), so these are left over from before the
  // trust chain existed — or from a source nobody analysed since. They were
  // read as finished and in-progress steps, so "Not analysed yet" sat above a
  // bar saying "2 of 7 steps done". Nothing built on an analysis that is not on
  // record can be a done step, and calling it "not started" would hide what is
  // there: it is out of date, said in words, until the analysis runs and the
  // step is made again.
  if (!hasRun) {
    const noAnalysis = (base: RailStep): RailStep =>
      stale(base, 'Made before this project had a signed analysis — run the analysis, then make it again.', 'Out of date');
    const leftovers = hasGenerated || tests.total > 0 || hasDocs;
    return [
      analyze,
      hasDesign ? noAnalysis(design) : design,
      hasGenerated ? noAnalysis(transformation) : transformation,
      hasDocs ? noAnalysis(documentation) : documentation,
      tests.total > 0 ? noAnalysis(testing) : testing,
      economics,
      leftovers
        ? stale(delivery, 'Nothing can be handed over before a signed analysis — run the analysis first.', 'Blocked')
        : delivery,
    ];
  }

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
      ? stale(design, `Designed for ${prevBasis} — regenerate it against the current analysis.`)
      : hasDesign && s.signOff
        ? { ...design, state: 'partial', done: false, proven: false, verifiedOutside: null, badge: 'Re-confirm', detail: `The sign-off was given for ${prevBasis} — confirm the target architecture again.` }
        : design,
    hasGenerated && s.code
      ? stale(transformation, `Generated from ${prevBasis} — regenerate it once the design is current.`)
      : transformation,
    hasDocs && s.docs ? stale(documentation, `Written for ${prevBasis} — regenerate it.`) : documentation,
    tests.total > 0 && s.tests ? stale(testing, `Test cases written for ${prevBasis} — regenerate the suite.`) : testing,
    hasRun && (s.sourceChanged || s.unverifiedInputs.length > 0)
      ? stale(economics, 'Modelled on the score of a different source — re-run the analysis.')
      : economics,
    blockers.length > 0
      ? stale(delivery, `Handover blocked — built for ${prevBasis}: ${blockers.join(', ')}.`, 'Blocked')
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
