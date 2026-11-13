/**
 * Where a reader stands with Analyze in the Business view — in this browser and only here (plan
 * `docs/design/analyze-business-first-plan.md` §4.2, AB-4; O1, O8, N9; ADR-118).
 *
 * Three facts, each per project:
 *
 *   - **walked** (`cc.analyze.walked.<projectId>`): the last station of the walk-through was shown once, or the
 *     soft-gate note was dismissed (O1). Holds the day it happened (`2026-11-13`), so a return visit can say "walked
 *     through on 13 Nov" (mockup state 17). It takes the soft-gate hint away and brings the two endings and "What you
 *     can do next".
 *   - **next hidden** (`cc.analyze.nextHidden.<projectId>`): "Hide" was pressed on "What you can do next" (N9,
 *     mockup state 9b). A quiet link below the endings brings it back.
 *   - **later tool opened** (`cc.analyze.toolOpened.<projectId>`): a tool after Analyze was opened once in this
 *     browser. Until then an analysis-only reader sees no "Next" tag on the tool bar (O8, ADR-060 amended).
 *
 * **Nothing here is a fact about the case.** What a person has already seen does not belong on the account, in the
 * signed run or in a phase (ADR-036, `lib/first-look.ts`): no Firestore write, no server field, and
 * `lib/workflow-steps.ts` never reads it — walking through changes no phase.
 *
 * Pure: every read and write takes the store, so the spec runs it against a map and the page against
 * `localStorage`. Every access is wrapped — a private window or blocked site data reads as "not yet" and writes
 * nothing, which at worst shows the invitation or the card once more.
 */

export const WALKED_PREFIX = 'cc.analyze.walked.';
export const NEXT_HIDDEN_PREFIX = 'cc.analyze.nextHidden.';
export const TOOL_OPENED_PREFIX = 'cc.analyze.toolOpened.';

/** Fired in this tab after a write, so every reader of the progress updates without a reload. */
export const ANALYZE_PROGRESS_EVENT = 'cc-analyze-progress';

/** The part of `Storage` this module uses. */
export interface ProgressStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AnalyzeProgress {
  /** The day the walk-through was finished (`YYYY-MM-DD`), or null. */
  walkedOn: string | null;
  nextHidden: boolean;
  laterToolOpened: boolean;
}

export const NO_PROGRESS: AnalyzeProgress = Object.freeze({ walkedOn: null, nextHidden: false, laterToolOpened: false });

export function progressKeys(projectId: string): { walked: string; nextHidden: string; toolOpened: string } {
  return {
    walked: `${WALKED_PREFIX}${projectId}`,
    nextHidden: `${NEXT_HIDDEN_PREFIX}${projectId}`,
    toolOpened: `${TOOL_OPENED_PREFIX}${projectId}`,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function get(store: ProgressStore | null, key: string): string | null {
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function set(store: ProgressStore | null, key: string, value: string | null): boolean {
  if (!store) return false;
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readProgress(store: ProgressStore | null, projectId: string): AnalyzeProgress {
  if (!projectId) return NO_PROGRESS;
  const keys = progressKeys(projectId);
  const walked = get(store, keys.walked);
  return {
    // A value this module did not write (an older build, a hand edit) still counts as walked, without a day.
    walkedOn: walked === null ? null : DAY.test(walked) ? walked : '',
    nextHidden: get(store, keys.nextHidden) === '1',
    laterToolOpened: get(store, keys.toolOpened) === '1',
  };
}

/** `2026-11-13` — the day, in the reader's own calendar. */
export function dayOf(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

/** The walk-through counts as done (O1). The first day stays: walking through again does not move it. */
export function markWalked(store: ProgressStore | null, projectId: string, at: Date): boolean {
  if (!projectId) return false;
  const key = progressKeys(projectId).walked;
  if (get(store, key) !== null) return false;
  return set(store, key, dayOf(at));
}

/** "Hide" on "What you can do next", or the quiet link that brings it back (N9). */
export function setNextHidden(store: ProgressStore | null, projectId: string, hidden: boolean): boolean {
  if (!projectId) return false;
  return set(store, progressKeys(projectId).nextHidden, hidden ? '1' : null);
}

/** A tool after Analyze was opened once in this browser (O8). */
export function markLaterToolOpened(store: ProgressStore | null, projectId: string): boolean {
  if (!projectId) return false;
  const key = progressKeys(projectId).toolOpened;
  if (get(store, key) === '1') return false;
  return set(store, key, '1');
}

/** One string per state, so `useSyncExternalStore` can compare snapshots by value. */
export function progressSnapshot(progress: AnalyzeProgress): string {
  return `${progress.walkedOn ?? '-'}|${progress.nextHidden ? 1 : 0}|${progress.laterToolOpened ? 1 : 0}`;
}

export function progressOfSnapshot(snapshot: string): AnalyzeProgress {
  const [walked, hidden, opened] = snapshot.split('|');
  return { walkedOn: walked === '-' || walked === undefined ? null : walked, nextHidden: hidden === '1', laterToolOpened: opened === '1' };
}

/* ------------------------------------------------------------- what the page shows */

/**
 * The page's state (mockup states 3, 5, 9, 17): `ready` before the walk-through, `tour` while it runs, `done` right
 * after it in this visit, `return` when it was finished on an earlier visit.
 */
export type AnalyzeStage = 'ready' | 'tour' | 'done' | 'return';

export function analyzeStage(input: { progress: AnalyzeProgress; touring: boolean; finishedThisVisit: boolean }): AnalyzeStage {
  if (input.touring) return 'tour';
  if (input.progress.walkedOn === null) return 'ready';
  return input.finishedThisVisit ? 'done' : 'return';
}

/** The soft-gate hint beside the tools stands until the walk-through is done (ADR-118). */
export function softGateShown(progress: AnalyzeProgress): boolean {
  return progress.walkedOn === null;
}

/** "What you can do next" stands after the walk-through, unless it was hidden for this project (N9). */
export function whatNextShown(progress: AnalyzeProgress): boolean {
  return progress.walkedOn !== null && !progress.nextHidden;
}

/** The card opens itself from 1024 px; at 768 px and on a phone it is one collapsed line (the 4.1 adjustment (1)). */
export const WHAT_NEXT_OPEN_FROM = 1024;

export function whatNextOpenAt(width: number): boolean {
  return width >= WHAT_NEXT_OPEN_FROM;
}

/** "13 Nov" — the day of a walk-through, as the return visit says it. Null for a day this module did not write. */
export function walkedDayLabel(walkedOn: string | null): string | null {
  if (!walkedOn || !DAY.test(walkedOn)) return null;
  const [, m, d] = walkedOn.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return month ? `${String(d).padStart(2, '0')} ${month}` : null;
}

/**
 * The "Next" tag on the tool bar (O8, ADR-060 amended): hidden for an analysis-only reader — Analyze is behind and
 * no tool after it has anything on record (Economics' baseline is not the reader's work) — until a later tool was
 * opened once in this browser. Where Analyze itself is next, the tag stays: that is not a later tool.
 */
export function nextTagShown(
  tools: ReadonlyArray<{ key: string; state: string }>,
  next: string | null,
  laterToolOpened: boolean,
): boolean {
  if (next === null) return false;
  if (next === 'analyze' || laterToolOpened) return true;
  const analysisOnly = tools.every((t) => t.key === 'analyze' || t.key === 'tco' || t.state === 'empty');
  return !analysisOnly;
}

/* ------------------------------------------------------------- the browser */

/** `localStorage`, or null where it cannot be reached. */
export function browserStore(): ProgressStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Tells the readers in this tab that the progress changed. */
export function announceProgress(): void {
  try {
    window.dispatchEvent(new Event(ANALYZE_PROGRESS_EVENT));
  } catch {
    /* no window: nothing to tell */
  }
}
