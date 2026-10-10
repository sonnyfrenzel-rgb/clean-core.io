/**
 * "Your analysis is ready" — until this browser has opened Analyze once for a
 * project (ADR-090).
 *
 * Owner, 10.10.2026, on the Business view of Z_MM_PO_APPROVAL: the hub's
 * "Continue with" names Design — correctly, Analyze is done — and a first-time
 * reader coming from the Business view walks past the Analyze tool and never
 * sees what the engine found. The fix is an **addition, never a change of phase
 * state**: Analyze stays `done` in `lib/workflow-steps.ts`, "Next: Design"
 * stays the next step, and until the reader has opened Analyze once two places
 * say there is a result to read — a "Result ready" tag on the Analyze tool and
 * one line in the work area, with the figures of the signed run.
 *
 * **Where the state lives.** In the browser and only in the browser, for the
 * reason the coach marks (ADR-036, `lib/coach-marks.ts`) and the first look's
 * second visit (`lib/first-look.ts`) give: what a person has opened is not a
 * fact about the case. Never on the project, the run or the account — no
 * Firestore write, no route. Keyed by project (the demo by `demo`), because
 * each project has its own result. Owner and reader alike: a reader can open
 * Analyze too, and this browser is theirs.
 *
 * Every access is wrapped. A read that fails answers "read", so a page with
 * blocked storage never carries a marker that cannot be cleared — the marker is
 * a pointer, and a pointer that will not leave is a trap; the analysis itself
 * stays one click away in the tool bar either way.
 */

import type { PhaseState } from './workflow-steps';
import type { WorklistItem } from './types';

export const ANALYSIS_READ_KEY = 'cc.workspace.analysis.read';

/** The key of the demo, which has no project id. */
export const DEMO_ANALYSIS_KEY = 'demo';

/** Fired in this tab after a mark, so every open hint updates without a reload. */
export const ANALYSIS_READ_EVENT = 'cc-analysis-read';

function readIds(): string[] {
  const raw = window.localStorage.getItem(ANALYSIS_READ_KEY);
  const parsed: unknown = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
}

/** Has this browser opened Analyze for this project, with a result on it? Fails to "read". */
export function analysisRead(key: string): boolean {
  try {
    return readIds().includes(key);
  } catch {
    return true;
  }
}

/** Called by the Analyze stage once it shows a result (a signed run, or the demo's reading). */
export function markAnalysisRead(key: string): void {
  try {
    const ids = readIds();
    if (ids.includes(key)) return;
    // Bounded like the first look's list: the oldest is the one least likely to be re-read.
    window.localStorage.setItem(ANALYSIS_READ_KEY, JSON.stringify([...ids, key].slice(-50)));
    window.dispatchEvent(new Event(ANALYSIS_READ_EVENT));
  } catch {
    /* private window, blocked site data — the hint shows once more */
  }
}

/** The key a stage's tool bar reads, from its base: `/demo` or `/project/<id>`. */
export function analysisKeyOfBase(base: string): string | null {
  if (base === '/demo') return DEMO_ANALYSIS_KEY;
  const m = /^\/project\/([^/?#]+)$/.exec(base);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** What the line in the work area may say — counted from the run's worklist, never estimated. */
export interface AnalysisResult {
  /** Findings as Analyze counts them, one per pattern and object; `null` when the run carries no worklist. */
  findings: number | null;
  /** Of those, the ones of high severity (Critical or High); `null` with `findings`. */
  high: number | null;
}

/** The figures of a worklist: its findings (not the model's functional gaps) and the high ones. */
export function resultOfWorklist(worklist: readonly WorklistItem[] | null | undefined): AnalysisResult {
  if (!Array.isArray(worklist)) return { findings: null, high: null };
  const findings = worklist.filter((item) => item.category === 'Finding');
  return { findings: findings.length, high: findings.filter((item) => item.severity === 'High').length };
}

/**
 * Whether the analysis is a result waiting to be read, and its figures — or
 * `null` when there is nothing to point at.
 *
 * Only where Analyze is `done` by the phase contract: while it is empty,
 * partial or out of date Analyze is itself the next step and already named;
 * and only with a signed run, because "ready" is a claim about a run. This
 * reads the phase state and never writes one.
 */
export function analysisReadyResult(input: {
  analyzeState: PhaseState | null | undefined;
  hasSignedRun: boolean;
  worklist: readonly WorklistItem[] | null | undefined;
}): AnalysisResult | null {
  if (input.analyzeState !== 'done' || !input.hasSignedRun) return null;
  return resultOfWorklist(input.worklist);
}

/**
 * Whether a tool of the bar carries "Result ready": the Analyze tool, `done`
 * by the phase contract (a signed run — never the demo's rail, which the demo
 * reads as done the way its next step does), not yet opened in this browser.
 */
export function resultReadyTag(tool: { key: string; state: PhaseState }, read: boolean): boolean {
  return tool.key === 'analyze' && tool.state === 'done' && !read;
}
