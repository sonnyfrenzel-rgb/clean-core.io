/**
 * Every code the Transformation can show, explained once (owner, 13.10.2026).
 *
 * One table, read by the start screen's pre-flight check and by the rows of
 * the running generation alike: a code is shown as `lease-busy · 429`, with
 * one plain sentence of what it means and one of what the reader can do. A
 * code this table does not know is shown as `unexpected error · <status>` —
 * never as nothing.
 *
 * The codes are the ones the server already returns in this flow — the lease
 * route, `/api/gemini` under a lease, the contract and store route — and the
 * few the browser itself decides (the call budget, an unusable answer, the
 * pre-flight limits). `tests/transformation-error-codes.spec.ts` reads the
 * routes and fails on a code that has no entry.
 *
 * `counted`: whether `/api/gemini` counted the call against the lease before
 * answering with this code. A refusal before `acquireLeaseCall` costs the
 * generation nothing, so the orchestrator must not count it either (13.10.2026:
 * every `lease-busy` refusal was counted in the browser, and a 48-call budget
 * was gone in seconds). Unknown codes count — the safe side of a budget.
 *
 * Pure: no React, no Next, no Firestore.
 */

import { MODEL_CALL_DEADLINE_MS } from '../model-deadline';
import { LEASES_PER_WINDOW, LEASE_MAX_IN_FLIGHT } from './lease';

export type CodeAction = 'wait' | 'restart' | 'nothing' | 'change' | 'reload' | 'settings';

export interface CodeExplanation {
  /** A few words, lower case — what the row says beside the code. */
  title: string;
  /** One sentence: what happened. */
  explain: string;
  /** One sentence: what the reader can do. */
  action: string;
  kind: CodeAction;
  /** Did `/api/gemini` count a call it answered with this code against the lease? Only for codes of that route. */
  counted?: boolean;
}

const WAIT_NOTHING = 'Nothing to do — the generation waits and asks again by itself.';
const RESTART = 'Start the generation again.';

export const TRANSFORMATION_CODES = {
  // ── /api/gemini under a lease (refused before the lease counts the call) ──
  'lease-invalid': {
    title: 'lease not valid',
    explain: 'The model call named a generation lease that does not exist for this account.',
    action: RESTART,
    kind: 'restart',
    counted: false,
  },
  'lease-closed': {
    title: 'generation replaced',
    explain: 'This generation was cancelled or a newer one of the same project replaced it, so its calls are no longer answered.',
    action: 'Nothing to do if you started a new generation; otherwise start it again.',
    kind: 'restart',
    counted: false,
  },
  'lease-expired': {
    title: 'time limit reached',
    explain: 'The generation ran longer than its lease allows, so further model calls were refused.',
    action: 'Start the generation again; written functions of this run are not kept.',
    kind: 'restart',
    counted: false,
  },
  'lease-exhausted': {
    title: 'call budget used up',
    explain: 'The generation has made every model call its lease allows.',
    action: 'Store what was written, or start again with a smaller program.',
    kind: 'restart',
    counted: false,
  },
  'lease-busy': {
    title: 'waiting for a free slot',
    explain: `${LEASE_MAX_IN_FLIGHT} model calls of this generation are already running; this one waits for one of them to finish.`,
    action: WAIT_NOTHING,
    kind: 'wait',
    counted: false,
  },
  'lease-stage': {
    title: 'wrong stage',
    explain: 'A generation lease pays only for calls of the Transformation stage.',
    action: 'Reload the page and start the generation again.',
    kind: 'reload',
    counted: false,
  },
  'lease-prompt-too-large': {
    title: 'function too large for one call',
    explain: 'The prompt for this function is longer than one fill call may carry, so it was not sent.',
    action: 'The function stays a stub; split the routine in the original or write it by hand.',
    kind: 'change',
    counted: false,
  },
  'too-large': {
    title: 'request too large',
    explain: 'The request was larger than the server accepts, so it was not processed.',
    action: 'Split the program, or write the affected function by hand.',
    kind: 'change',
    counted: false,
  },
  'model-stage-disabled': {
    title: 'stage switched off',
    explain: 'The Transformation stage is switched off for this account.',
    action: 'Turn it back on in Settings, then generate again.',
    kind: 'settings',
    counted: false,
  },
  'model-key-missing': {
    title: 'no model key',
    explain: 'No Gemini key is available for this account.',
    action: 'Add your own key in Settings, then generate again.',
    kind: 'settings',
    counted: false,
  },
  'byok-key-unavailable': {
    title: 'your key is not available',
    explain: 'Your own Gemini key could not be used for this call.',
    action: 'Check the key in Settings, then generate again.',
    kind: 'settings',
    counted: false,
  },
  'byok-key-unreadable': {
    title: 'your key could not be read',
    explain: 'Your own Gemini key is stored but could not be read.',
    action: 'Save the key again in Settings, then generate again.',
    kind: 'settings',
    counted: false,
  },
  // ── /api/gemini, after the lease counted the call ──
  'model-timeout': {
    title: 'the model took too long',
    explain: `The model did not answer within ${Math.round(MODEL_CALL_DEADLINE_MS / 1000)} seconds, so the call was stopped and nothing from it was used.`,
    action: 'Nothing to do — the function is asked once more; if it fails again it stays a stub.',
    kind: 'nothing',
    counted: true,
  },
  'model-incomplete': {
    title: 'answer cut off',
    explain: 'The model stopped before it finished its answer, so the answer was not used.',
    action: 'Nothing to do — the function is asked once more; if it fails again it stays a stub.',
    kind: 'nothing',
    counted: true,
  },
  // ── the lease route ──
  'lease-hourly-limit': {
    title: 'generations per hour used',
    explain: `An account can start at most ${LEASES_PER_WINDOW} code generations per hour.`,
    action: 'Wait until the next generation of the hour is free.',
    kind: 'wait',
  },
  'model-hourly-limit': {
    title: 'model calls per hour used',
    explain: 'This account has used its model calls of the hour.',
    action: 'Wait up to an hour, or add your own Gemini key in Settings.',
    kind: 'wait',
  },
  'generation-stale': {
    title: 'project changed',
    explain: 'The project changed after this generation was prepared.',
    action: 'Reload the page and generate from the current state.',
    kind: 'reload',
  },
  'bad-request': {
    title: 'request not accepted',
    explain: 'The server could not read the request.',
    action: 'Reload the page and try again.',
    kind: 'reload',
  },
  'no-generation-token': {
    title: 'generation not named',
    explain: 'The request did not say which state of the project it generates from.',
    action: 'Reload the page and try again.',
    kind: 'reload',
  },
  'no-source': {
    title: 'no source',
    explain: 'No ABAP source is staged on this project, so there is nothing to generate from.',
    action: 'Add the source in Analyze first.',
    kind: 'change',
  },
  'off-track': {
    title: 'target not generated here',
    explain: 'The decided target architecture is not one this platform generates code for.',
    action: 'Review the target in Design.',
    kind: 'change',
  },
  'no-contract': {
    title: 'no contract',
    explain: 'There is no architecture contract to generate against.',
    action: 'Bind a run and a target deployment in Analyze and Design, then come back.',
    kind: 'change',
  },
  'contract-blocked': {
    title: 'contract blocked',
    explain: 'The architecture contract of this project does not allow a generation.',
    action: 'Resolve what the contract names in Design.',
    kind: 'change',
  },
  'decision-off-track': {
    title: 'decision outside the target',
    explain: 'The recorded decision points to a target this platform does not generate.',
    action: 'Review the decision in Design.',
    kind: 'change',
  },
  // ── the store (contract route) ──
  'bad-generation-record': {
    title: 'record not accepted',
    explain: 'The record of how the code was generated was not accepted, so nothing was saved.',
    action: RESTART,
    kind: 'restart',
  },
  'no-code': {
    title: 'nothing to store',
    explain: 'No generated package was named, so nothing was saved.',
    action: RESTART,
    kind: 'restart',
  },
  'no-contract-named': {
    title: 'contract not named',
    explain: 'The package did not name the contract it was generated against, so nothing was saved.',
    action: RESTART,
    kind: 'restart',
  },
  'contract-moved': {
    title: 'contract changed',
    explain: 'The architecture contract changed while the code was written, so nothing was saved.',
    action: 'Reload the page and generate from the current contract.',
    kind: 'reload',
  },
  'package-incomplete': {
    title: 'package incomplete',
    explain: 'The generated package misses files a package of this target needs, so nothing was saved.',
    action: RESTART,
    kind: 'restart',
  },
  'project-too-large': {
    title: 'project too large to store',
    explain: 'The package would make the project larger than one record may be; it is kept on screen, unsaved.',
    action: 'Download the package, or split the program.',
    kind: 'change',
  },
  'project-moved': {
    title: 'project changed',
    explain: 'The project changed while the code was written, so nothing was saved.',
    action: 'Reload the page and generate again.',
    kind: 'reload',
  },
  // ── decided in the browser ──
  'call-budget-used': {
    title: 'call budget used up',
    explain: 'The generation has made every model call its lease allows; functions not asked yet stay stubs.',
    action: 'Store what was written, or start again with a smaller program.',
    kind: 'restart',
  },
  'answer-unusable': {
    title: 'answer could not be used',
    explain: 'The model answered, but not in a form a function can be taken from.',
    action: 'Nothing to do — the function is asked once more; if it fails again it stays a stub.',
    kind: 'nothing',
  },
  'model-declined': {
    title: 'declined by the model',
    explain: 'The model said it cannot write this function from what it was given, and gave a reason.',
    action: 'Read the reason; write the function by hand or improve the inputs it names.',
    kind: 'change',
  },
  'body-refused': {
    title: 'refused by the checks',
    explain: 'The body the model wrote touched engine-written code or broke a rule for fills, so it was not used.',
    action: 'Nothing to do — the repair rounds ask again; if it stays refused it remains a stub.',
    kind: 'nothing',
  },
  cancelled: {
    title: 'cancelled',
    explain: 'The generation was cancelled; nothing was stored.',
    action: 'Start the generation again when you are ready.',
    kind: 'restart',
  },
  'network-error': {
    title: 'connection lost',
    explain: 'The request did not reach the server or its answer did not come back.',
    action: 'Check the connection; the function is asked once more.',
    kind: 'nothing',
  },
  'plan-too-large': {
    title: 'program too large for one generation',
    explain: 'The plan needs more fill calls than one generation may make.',
    action: 'Split the program into smaller ones and generate each.',
    kind: 'change',
  },
  'plan-over-time-limit': {
    title: 'longer than the time limit',
    explain: 'The expected duration is longer than one generation may run.',
    action: 'Split the program into smaller ones and generate each.',
    kind: 'change',
  },
  'plan-unit-too-large': {
    title: 'function too large for one call',
    explain: 'The prompt of a function is longer than one fill call may carry; it will not be written.',
    action: 'The rest is written; split the routine in the original or write it by hand.',
    kind: 'change',
  },
} as const satisfies Record<string, CodeExplanation>;

export type TransformationCode = keyof typeof TRANSFORMATION_CODES;

export const isKnownCode = (code: unknown): code is TransformationCode =>
  typeof code === 'string' && Object.prototype.hasOwnProperty.call(TRANSFORMATION_CODES, code);

/** What a code means — or "unexpected error" for one this table does not know. */
export function explainCode(code: string | null | undefined, status?: number | null): CodeExplanation & { code: string | null; label: string } {
  const s = typeof status === 'number' && status > 0 ? status : null;
  if (isKnownCode(code)) {
    const e: CodeExplanation = TRANSFORMATION_CODES[code];
    return { ...e, code, label: s === null ? code : `${code} · ${s}` };
  }
  return {
    code: code ?? null,
    title: 'unexpected error',
    explain: code ? `The server answered with a code this page does not know (${code}).` : 'The server answered with an error this page does not know.',
    action: 'Nothing to do now; if it repeats, start the generation again.',
    kind: 'nothing',
    label: s === null ? 'unexpected error' : `unexpected error · ${s}`,
  };
}

/**
 * Did `/api/gemini` count this failed call against the lease? From the code it
 * answered with; a 401 carries none and was refused before the lease was read.
 * Unknown codes and plain failures count — never fewer calls than the server
 * saw.
 */
export function serverCountedCall(code: string | null | undefined, status?: number | null): boolean {
  if (isKnownCode(code)) {
    const e: CodeExplanation = TRANSFORMATION_CODES[code];
    if (typeof e.counted === 'boolean') return e.counted;
  }
  if (!code && status === 401) return false;
  return true;
}
