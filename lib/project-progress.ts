import { staleness, workflowSteps, workflowSummary, type PhaseKey, type RailStep } from '@/lib/workflow-steps';
import type { Project } from '@/lib/types';

/**
 * Where a project stands, said so a business reader takes it in at a glance —
 * the Status cell of "My workspace" (`DESIGN.md` §2.4: status as text with a
 * dot; mockup s7: one status and one line under it).
 *
 * Owner feedback, twice: on 01.10.2026 *"Ich verstehe hier den Status, Zahlen
 * und Farben-Logik nicht"*, and on 02.10.2026 *"der Farbcode für die Status
 * sieht viel zu verwirrend und komplex aus"*. The row then carried a seven-
 * segment bar in five looks with a legend above the list, and on projects from
 * before the trust chain it said "Not analysed yet" over "2 of 7 steps done" —
 * the bar counted a design and code that no signed analysis stands behind
 * (fixed in `workflowSteps()`: such steps are out of date, never done).
 *
 * So the row says three things and no more:
 *
 *   1. **one sentence** — where the project stands, in plain words;
 *   2. **the step it is at** — "Step 2 of 7" — and **the one next action**, as
 *      a link that says what it does;
 *   3. **a dot with three looks** — nothing under way yet (hollow), under way
 *      (ink), something out of date (warning). Never green: a list row proves
 *      nothing, and the sentence carries the meaning, so colour is never the
 *      only cue.
 *
 * The seven steps one by one live one level deeper — the project's own
 * stepper and status line — read from the same phase contract. Pure.
 */

export interface ProgressStep {
  key: PhaseKey;
  label: string;
  /** The phase contract's own state — kept so the row and the stepper compare one value. */
  phaseState: RailStep['state'];
  badge: string;
  detail: string;
}

/** Where a project stands, in five plain words — the Status filter's values. */
export type ProjectStage = 'not-started' | 'not-analysed' | 'in-progress' | 'all-done' | 'handed-over';

export const PROJECT_STAGE_LABEL: Record<ProjectStage, string> = {
  'not-started': 'Not started',
  'not-analysed': 'Not analysed yet',
  'in-progress': 'In progress',
  'all-done': 'All steps done',
  'handed-over': 'Handed over',
};

/**
 * The dot beside the sentence — three looks, no more.
 *
 * - `waiting`  nothing under way yet: a hollow ring.
 * - `moving`   analysed and under way, done, or handed over: filled ink.
 * - `outdated` something on record no longer matches: the warning mark.
 */
export type ProgressTone = 'waiting' | 'moving' | 'outdated';

export const PROGRESS_TONE_CLASS: Record<ProgressTone, string> = {
  waiting: 'bg-cc-surface border-2 border-cc-ink-muted',
  moving: 'bg-cc-ink border-2 border-cc-ink',
  outdated: 'bg-cc-warning-mark border-2 border-cc-warning-mark',
};

export interface ProjectProgress {
  /** The seven steps from the phase contract — for readers one level deeper, not drawn in the row. */
  steps: ProgressStep[];
  total: number;
  stage: ProjectStage;
  tone: ProgressTone;
  /** One plain sentence: where the project stands. */
  sentence: string;
  /** "Step 2 of 7" — the step the next action belongs to; `null` once nothing is open. */
  stepLabel: string | null;
  /** Some result is out of date — built for other code or inputs, or without a signed analysis. */
  stale: boolean;
  /** The next thing to do, as a link label and its stage — `null` once nothing is open. */
  next: { label: string; path: string } | null;
}

/** "Next: Run the analysis" — what pressing the link starts, per phase and its state. */
function nextActionLabel(step: RailStep, hasSource: boolean): string {
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

export function stepOfLabel(n: number, total: number): string {
  return `Step ${n} of ${total}`;
}

export function projectProgress(project: Project | null): ProjectProgress {
  const rail = workflowSteps(project);
  const { doneCount, total, next } = workflowSummary(rail);
  const steps: ProgressStep[] = rail.map((s) => ({
    key: s.key,
    label: s.label,
    phaseState: s.state,
    badge: s.badge,
    detail: s.detail,
  }));
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const s = staleness(project);
  const anyStaleStep = rail.some((x) => x.state === 'stale');
  const stale = s.sourceChanged || s.unverifiedInputs.length > 0 || anyStaleStep;
  // Inputs the signed run cannot be shown to have used (a target that changed,
  // one it never recorded) are not a change of the code.
  const codeMoved = s.sourceChanged || (s.unverifiedInputs.length === 0 && s.basis === 'source');

  let stage: ProjectStage;
  let sentence: string;
  if (project?.auditMetadata?.auditPackExportedAt) {
    stage = 'handed-over';
    sentence = 'Handed over — the evidence package was exported.';
  } else if (doneCount === total) {
    stage = 'all-done';
    sentence = `All ${total} steps done.`;
  } else if (!hasSource && !hasRun) {
    stage = 'not-started';
    sentence = anyStaleStep
      ? 'Not started — no code uploaded, and earlier results are out of date.'
      : 'Not started — no code uploaded yet.';
  } else if (!hasRun) {
    stage = 'not-analysed';
    // Results from before any signed analysis are on record: say so, in words,
    // instead of counting them as steps done.
    sentence = anyStaleStep
      ? 'Not analysed yet — earlier results on it are out of date.'
      : 'Not analysed yet — the code is uploaded.';
  } else {
    stage = 'in-progress';
    sentence = stale
      ? `Analysed — some results no longer match ${codeMoved ? 'the code' : 'their inputs'}.`
      : 'Analysed — in progress.';
  }

  const open = !next.done && stage !== 'handed-over' && stage !== 'all-done';
  const tone: ProgressTone = stale
    ? 'outdated'
    : stage === 'not-started' || stage === 'not-analysed'
      ? 'waiting'
      : 'moving';

  return {
    steps,
    total,
    stage,
    tone,
    sentence,
    stepLabel: open ? stepOfLabel(next.n, total) : null,
    stale,
    next: open ? { label: nextActionLabel(next, hasSource), path: next.path } : null,
  };
}
