/**
 * A start the reader asked for with a click on the Decide page, handed to the tool that runs it (lawyer's statement
 * 24c, owner 27.11.2026): "Record and write the design (sends answers to …)" hands the design to Design, "Generate
 * draft (sends code to …)" hands the code generation to Transformation. Both tools run their model work in the
 * browser, on their own page, with their own progress, checks and stores; the click only says "start it there now".
 *
 * **Memory only, by design.** The request lives in this module of the running app and nowhere else: not in the
 * address (no query, no hash), not in browser storage, not on the server. It survives the client-side navigation the
 * click makes and nothing more. A reload, a direct visit, a bookmark, another tab or a link shared on reads no request,
 * so opening a tool still calls no model (legal review 06.11.2026, 3.0.21 item 1). It is taken once, for its project
 * and its step only, and it expires after `START_REQUEST_TTL_MS` if the navigation never lands.
 *
 * Pure apart from the one module variable; no React, no window.
 */

export type StartStep = 'design' | 'transformation';

/** How long a click's request waits for its tool to open. */
export const START_REQUEST_TTL_MS = 120_000;

let pending: { projectId: string; step: StartStep; at: number } | null = null;

/** Called by the click handler on the Decide page, right before it navigates to the tool. */
export function requestStartOnArrival(projectId: string, step: StartStep, now: number = Date.now()): void {
  pending = { projectId, step, at: now };
}

/** Called once by the tool when it could start the work itself: true exactly once per click, for its project and step. */
export function takeStartRequest(projectId: string, step: StartStep, now: number = Date.now()): boolean {
  if (!pending) return false;
  if (now - pending.at > START_REQUEST_TTL_MS) {
    pending = null;
    return false;
  }
  if (pending.projectId !== projectId || pending.step !== step) return false;
  pending = null;
  return true;
}

/** Whether a request for this project and step is waiting (read-only; for the tool's "starting…" line). */
export function startRequested(projectId: string, step: StartStep, now: number = Date.now()): boolean {
  return Boolean(pending && pending.projectId === projectId && pending.step === step && now - pending.at <= START_REQUEST_TTL_MS);
}
