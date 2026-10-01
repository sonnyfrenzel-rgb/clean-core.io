import { staleness, workflowSteps, workflowSummary, type PhaseKey, type RailStep } from '@/lib/workflow-steps';
import type { Project } from '@/lib/types';

/**
 * How far a project is, said so a business reader understands it without a
 * key — the row of "My workspace" (owner feedback 01.10.2026: *"Ich verstehe
 * hier den Status, Zahlen und Farben-Logik nicht"*).
 *
 * What was wrong, measured on the old row: the count said "2/7" while six of
 * seven segments were orange, because the count was *phases with their own
 * evidence* and the bar painted every phase with *anything* on record in the
 * same warning colour; the status word "draft" meant "source staged, no signed
 * run"; and the line under it repeated the same fact in other words.
 *
 * Here the count and the bar are one thing. Each segment is one of five
 * states, read only from the phase contract (`lib/workflow-steps.ts`), and the
 * count is the number of segments that are done — so they cannot disagree:
 *
 *   - **done, verified** — on record and checked (a signed run, an executed
 *     verdict): the success colour, the only green (`DESIGN.md` §1.1, ADR-007);
 *   - **done** — on record, not verified: ink — finished, not proven;
 *   - **in progress** — something on record, not finished: amber, and only this;
 *   - **not started** — nothing on record: grey;
 *   - **out of date** — built for a source that is no longer the one here:
 *     dashed, no fill.
 *
 * Every segment carries its phase's name (tooltip and accessible text), and
 * the next action is a link that says what it does. Pure — the spec drives it.
 */

export type SegmentState = 'done-verified' | 'done' | 'in-progress' | 'not-started' | 'stale';

export const SEGMENT_LABEL: Record<SegmentState, string> = {
  'done-verified': 'Done and verified',
  done: 'Done',
  'in-progress': 'In progress',
  'not-started': 'Not started',
  stale: 'Out of date',
};

/**
 * How each state looks — tokens only. Green (success) belongs to verified work
 * alone, amber to in progress alone, and the stale step is dashed so it is told
 * apart without colour.
 */
export const SEGMENT_CLASS: Record<SegmentState, string> = {
  'done-verified': 'bg-cc-success border border-cc-success',
  done: 'bg-cc-ink border border-cc-ink',
  'in-progress': 'bg-cc-warning-line border border-cc-warning-line',
  'not-started': 'bg-cc-line border border-cc-line',
  stale: 'bg-cc-surface border border-dashed border-cc-warning',
};

/** The legend order: how a project moves, left to right, then the exception. */
export const SEGMENT_ORDER: readonly SegmentState[] = ['done-verified', 'done', 'in-progress', 'not-started', 'stale'];

export interface ProgressSegment {
  key: PhaseKey;
  label: string;
  state: SegmentState;
  /** The phase contract's own state — kept so a reader of the row and the stepper compare one value. */
  phaseState: RailStep['state'];
  /** The phase contract's few words — "Test draft", "Model estimate". */
  badge: string;
  /** What is on record for this phase, in the product's own words. */
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

export interface ProjectProgress {
  segments: ProgressSegment[];
  /** Segments that are done — verified or not. Always equals the done segments of the bar. */
  done: number;
  total: number;
  stage: ProjectStage;
  /** One plain sentence: what state the project is in. */
  sentence: string;
  /** "2 of 7 steps done". */
  countLabel: string;
  /** Some result was built for a source that is no longer the one here. */
  stale: boolean;
  /** The next thing to do, as a link label and its stage — `null` once nothing is open. */
  next: { label: string; path: string } | null;
}

export function segmentStateOf(step: Pick<RailStep, 'state' | 'proven'>): SegmentState {
  if (step.state === 'stale') return 'stale';
  if (step.state === 'done') return step.proven ? 'done-verified' : 'done';
  if (step.state === 'partial') return 'in-progress';
  return 'not-started';
}

/** "Next: Run the analysis" — what pressing the link starts, per phase and its state. */
function nextActionLabel(step: RailStep, hasSource: boolean): string {
  if (step.state === 'stale') return `Bring ${step.label} up to date`;
  const started = step.state === 'partial';
  switch (step.key) {
    case 'analyze':
      return hasSource ? 'Run the analysis' : 'Upload the code';
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

export function stepsDoneLabel(done: number, total: number): string {
  return `${done} of ${total} steps done`;
}

export function projectProgress(project: Project | null): ProjectProgress {
  const steps = workflowSteps(project);
  const { doneCount, total, next } = workflowSummary(steps);
  const segments: ProgressSegment[] = steps.map((s) => ({
    key: s.key,
    label: s.label,
    state: segmentStateOf(s),
    phaseState: s.state,
    badge: s.badge,
    detail: s.detail,
  }));
  const done = segments.filter((s) => s.state === 'done' || s.state === 'done-verified').length;
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const s = staleness(project);
  const stale = s.sourceChanged || s.unverifiedInputs.length > 0 || segments.some((x) => x.state === 'stale');

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
    sentence = 'Not started — no code uploaded yet.';
  } else if (!hasRun) {
    stage = 'not-analysed';
    sentence = 'Not analysed yet — the code is uploaded.';
  } else {
    stage = 'in-progress';
    sentence = `Analysed · ${stepsDoneLabel(done, total)}.`;
  }
  if (stale) sentence = `${sentence} Some results no longer match the code.`;

  return {
    segments,
    done,
    total,
    stage,
    sentence,
    countLabel: stepsDoneLabel(done, total),
    stale,
    next: next.done || stage === 'handed-over' ? null : { label: nextActionLabel(next, hasSource), path: next.path },
  };
}
