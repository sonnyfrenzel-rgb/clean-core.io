import { phaseActionLabel, staleness, workflowSteps, type PhaseKey, type RailStep } from '@/lib/workflow-steps';
import type { ProgressTone } from '@/lib/project-progress';
import type { Project } from '@/lib/types';

/**
 * Where a project stands, in the words of the home page v2 (AB-14b, owner decision H-O3, mockup
 * `docs/roadmap/home-mockup-v2.html`, function `status`).
 *
 * The analysis alone is a complete result: a project that was analysed and left there — the common case — reads
 * *Analysed · Map, findings and score ready* and has **nothing open**. Re-design (the six tools after Analyze) is its
 * own track and is named only once someone started it: *Re-design under way* with "N of 6 steps done", *Re-design
 * done*, *Handed over*. Re-design is never offered as a next step here (H-O3); inside a started re-design the next step
 * is that track's own.
 *
 * Read from the phase contract (`workflowSteps`, `staleness`) and never from `project.status`, a string a client can
 * write. The dot keeps its three looks (`ProgressTone`), never green.
 *
 * `attention` names what the status line warns about: the code changed since the analysis, the design no longer
 * matches the analysis, a test run failed. Since 3.3.0 it no longer decides the "Needs your attention" box, and the
 * list's Next step column no longer reads `next`: both come from the program tile (`needsAttention` and
 * `programNextLink` in `lib/workspace-tiles.ts`, owner decision 22.11.2026), so the list and the tiles cannot differ.
 *
 * Pure: no React, no Firestore. The server's row source (`/api/workspace-rows`) and the browser both read it.
 */

export type HomeStatusKind = 'nocode' | 'notrun' | 'analysed' | 'redesign' | 'complete' | 'handed';

export type AttentionReason = 'code-changed' | 'design-outdated' | 'test-failed';

/** The six tools of re-design, in the order of the phase contract. */
export const REDESIGN_KEYS: readonly PhaseKey[] = ['design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

export const REDESIGN_TOTAL = REDESIGN_KEYS.length;

export interface HomeNext {
  /** What pressing the link does — the phase contract's own wording (`phaseActionLabel`). */
  label: string;
  /** The tool it opens, by its name ("Analyze", "Design"). */
  tool: string;
  /** Route segment under `/project/{id}/`. */
  path: string;
  /** The next step is an analysis run: it goes through the confirmation dialog, never straight to a run (AB-14b). */
  run: boolean;
}

export interface HomeStatus {
  kind: HomeStatusKind;
  tone: ProgressTone;
  /** The first line — the status word. */
  title: string;
  /** The line under it. */
  detail: string;
  /** How the second line reads: plain, a warning (something out of date) or an error (a failed test run). */
  detailTone: 'plain' | 'warn' | 'err';
  /** Re-design steps done, 0–6, for the small six-segment bar (H-O4) — only on a started or finished re-design. */
  stepsDone: number | null;
  next: HomeNext | null;
  attention: AttentionReason | null;
}

/** The status words, by kind — what the Status filter offers, in the order a project moves. */
export const HOME_STATUS_LABEL: Readonly<Record<HomeStatusKind, string>> = Object.freeze({
  nocode: 'No code yet',
  notrun: 'Not analysed yet',
  analysed: 'Analysed',
  redesign: 'Re-design under way',
  complete: 'Re-design done',
  handed: 'Handed over',
});

export const HOME_STATUS_ORDER: readonly HomeStatusKind[] = ['nocode', 'notrun', 'analysed', 'redesign', 'complete', 'handed'];

/** Why a project needs attention, in one line — the attention card and the status line say the same. */
export const ATTENTION_LABEL: Readonly<Record<AttentionReason, string>> = Object.freeze({
  'code-changed': 'The code changed since the analysis',
  'design-outdated': 'Design no longer matches the analysis',
  'test-failed': 'A test run failed',
});

const DETAIL = {
  nocode: 'Upload the program to start',
  notrun: 'Code uploaded',
  analysed: 'Map, findings and score ready',
  codeChanged: 'The code changed since',
  designStarted: 'Design started',
  complete: `All ${REDESIGN_KEYS.length} steps done`,
  handed: 'Evidence package exported',
} as const;

export function redesignStepsLabel(done: number): string {
  return `${done} of ${REDESIGN_TOTAL} steps done`;
}

/**
 * A re-design tool has something of its own on record, or something of its own that went out of date. Economics and
 * Delivery count only when `done`: their `partial` and `stale` speak of other inputs — Economics' baseline is the
 * signed run itself, Delivery's material is the other tools' — so a changed source marks both stale on a project
 * nobody re-designed.
 */
function started(step: RailStep): boolean {
  if (step.state === 'done') return true;
  if (step.key === 'tco' || step.key === 'delivery') return false;
  return step.state === 'partial' || step.state === 'stale';
}

function nextOf(step: RailStep, hasSource: boolean): HomeNext {
  return { label: phaseActionLabel(step, hasSource), tool: step.label, path: step.path, run: step.key === 'analyze' && hasSource };
}

export function homeStatus(project: Project | null): HomeStatus {
  const rail = workflowSteps(project);
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const analyze = rail.find((s) => s.key === 'analyze')!;
  const redesign = rail.filter((s) => REDESIGN_KEYS.includes(s.key));
  const done = redesign.filter((s) => s.state === 'done').length;
  const base = { stepsDone: null, next: null, attention: null } as const;

  if (project?.auditMetadata?.auditPackExportedAt) {
    return { ...base, kind: 'handed', tone: 'moving', title: HOME_STATUS_LABEL.handed, detail: DETAIL.handed, detailTone: 'plain' };
  }
  if (!hasRun) {
    return hasSource
      ? { ...base, kind: 'notrun', tone: 'waiting', title: HOME_STATUS_LABEL.notrun, detail: DETAIL.notrun, detailTone: 'plain', next: nextOf(analyze, true) }
      : { ...base, kind: 'nocode', tone: 'waiting', title: HOME_STATUS_LABEL.nocode, detail: DETAIL.nocode, detailTone: 'plain', next: nextOf(analyze, false) };
  }

  // The source on the project is not the one the signed run analysed.
  const codeChanged = staleness(project).sourceChanged || analyze.state === 'stale';
  if (done === REDESIGN_TOTAL && !codeChanged) {
    return { ...base, kind: 'complete', tone: 'moving', title: HOME_STATUS_LABEL.complete, detail: DETAIL.complete, detailTone: 'plain', stepsDone: REDESIGN_TOTAL };
  }

  if (!redesign.some(started)) {
    return codeChanged
      ? {
          ...base,
          kind: 'analysed',
          tone: 'outdated',
          title: HOME_STATUS_LABEL.analysed,
          detail: DETAIL.codeChanged,
          detailTone: 'warn',
          next: nextOf(analyze, hasSource),
          attention: 'code-changed',
        }
      : { ...base, kind: 'analysed', tone: 'moving', title: HOME_STATUS_LABEL.analysed, detail: DETAIL.analysed, detailTone: 'plain' };
  }

  // A started re-design.
  const status: HomeStatus = {
    kind: 'redesign',
    tone: 'moving',
    title: HOME_STATUS_LABEL.redesign,
    detail: done > 0 ? redesignStepsLabel(done) : DETAIL.designStarted,
    detailTone: 'plain',
    stepsDone: done,
    next: null,
    attention: null,
  };
  if (codeChanged) {
    return { ...status, tone: 'outdated', detail: ATTENTION_LABEL['code-changed'], detailTone: 'warn', next: nextOf(analyze, hasSource), attention: 'code-changed' };
  }
  const design = redesign.find((s) => s.key === 'design');
  if (design && design.state === 'stale') {
    return { ...status, tone: 'outdated', detail: ATTENTION_LABEL['design-outdated'], detailTone: 'warn', next: nextOf(design, hasSource), attention: 'design-outdated' };
  }
  const testing = redesign.find((s) => s.key === 'testing');
  const open = redesign.find((s) => s.state !== 'done' && s.key !== 'tco') ?? null;
  if (testing && testing.state !== 'done' && testing.runFailed) {
    return { ...status, detail: ATTENTION_LABEL['test-failed'], detailTone: 'err', next: nextOf(testing, hasSource), attention: 'test-failed' };
  }
  return { ...status, next: open ? nextOf(open, hasSource) : null };
}
