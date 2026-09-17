import { getAuth } from '@/lib/firebase';
import type { ProcessStateView, StateChoiceInput } from '@/lib/process-states';

/**
 * The browser half of roadmap 3.5 — the two calls a confirmation screen makes.
 *
 * ```ts
 * const view = await fetchProcessStates(projectId);          // subjects, entries, links
 * const done = await confirmProcessStates(projectId, view.revision, [
 *   { subject: 'BR-002', kind: 'rule', state: 'change', note: 'Tolerance per material group.' },
 * ]);
 * if (done.ok) setView(done.view);                           // done.created says whether a revision was written
 * else showRefusal(confirmOutcomeSentence(done));
 * ```
 *
 * `confirmProcessStates` never throws for an ordinary outcome. A note the state
 * requires and does not have, a subject the process does not know, a revision
 * somebody else confirmed in the meantime and a process that was never
 * reconstructed are all states the screen shows — not exceptions it has to
 * catch.
 */

export function processStatesPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/process-states`;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

function isView(value: unknown): value is ProcessStateView {
  const v = value as ProcessStateView | null;
  return (
    !!v
    && Number.isInteger(v.revision)
    && Array.isArray(v.subjects)
    && Array.isArray(v.entries)
    && Array.isArray(v.links)
  );
}

/** What has been confirmed for this process, or null when it cannot be read. */
export async function fetchProcessStates(projectId: string): Promise<ProcessStateView | null> {
  try {
    const res = await fetch(processStatesPath(projectId), { headers: await authHeader() });
    if (!res.ok) return null;
    const body = (await res.json()) as { view?: unknown };
    return isView(body.view) ? body.view : null;
  } catch {
    return null;
  }
}

/** Why a confirmation produced no revision. */
export type ConfirmRefusal =
  | 'bad-request'
  | 'unknown-subject'
  | 'note-required'
  | 'note-too-long'
  | 'too-many'
  | 'revision-moved'
  | 'no-baseline'
  | 'no-source'
  | 'source-moved'
  | 'format-version'
  | 'unreachable';

export type ConfirmOutcome =
  | {
    ok: true;
    view: ProcessStateView;
    /** False when every answer was already the answer on record — nothing was written. */
    created: boolean;
  }
  | {
    ok: false;
    code: ConfirmRefusal;
    error: string;
    status: number;
    /** The newest revision on the server, when the refusal is `revision-moved`. */
    latest?: number;
  };

/** The refusals this build knows, as values — the union above, once. */
export const CONFIRM_REFUSALS: readonly ConfirmRefusal[] = Object.freeze([
  'bad-request',
  'unknown-subject',
  'note-required',
  'note-too-long',
  'too-many',
  'revision-moved',
  'no-baseline',
  'no-source',
  'source-moved',
  'format-version',
  'unreachable',
] as ConfirmRefusal[]);

function isConfirmRefusal(value: unknown): value is ConfirmRefusal {
  return typeof value === 'string' && (CONFIRM_REFUSALS as readonly string[]).includes(value);
}

/**
 * Confirm one or more subjects as the next Bedarfsrevision.
 *
 * `baseRevision` is the revision the screen was read from — 0 when nothing has
 * been confirmed yet. When somebody else has confirmed since, nothing is
 * written and the outcome carries `latest`.
 */
export async function confirmProcessStates(
  projectId: string,
  baseRevision: number,
  choices: StateChoiceInput[],
): Promise<ConfirmOutcome> {
  try {
    const res = await fetch(processStatesPath(projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ baseRevision, choices }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      view?: unknown;
      created?: unknown;
      error?: string;
      code?: string;
      latest?: unknown;
    };
    if (res.ok && isView(body.view)) {
      return { ok: true, view: body.view, created: body.created === true };
    }
    return {
      ok: false,
      // A code this build does not know is not a code: passed through as one, a
      // newer server — or a proxy answering with its own JSON — could put a
      // value in the union that nothing here has a sentence for.
      code: isConfirmRefusal(body.code) ? body.code : 'unreachable',
      error: body.error || `This confirmation could not be stored (${res.status}).`,
      status: res.status,
      ...(typeof body.latest === 'number' ? { latest: body.latest } : {}),
    };
  } catch {
    return { ok: false, code: 'unreachable', error: 'This confirmation could not be stored.', status: 0 };
  }
}

/**
 * One outcome, one sentence a reader can act on.
 *
 * The server's `error` is written for the next programmer and `code` is a word
 * nobody outside these two files knows, so the translation lives here — where
 * it is asserted without a browser, and where TypeScript refuses a `switch`
 * that misses a case.
 *
 * `created: false` is not a failure. Confirming what is already on record
 * writes nothing on purpose; the sentence says so and does not apologise for an
 * error that did not happen.
 */
export function confirmOutcomeSentence(outcome: ConfirmOutcome): string {
  if (outcome.ok) {
    return outcome.created
      ? `Confirmed as revision ${outcome.view.revision}. Revision 1 of the process is unchanged.`
      : 'These answers are already on record, so no new revision was written.';
  }
  switch (outcome.code) {
    case 'bad-request':
      return 'This confirmation was not accepted. Reload the process and try again.';
    case 'unknown-subject':
      return outcome.error;
    case 'note-required':
      return outcome.error;
    case 'note-too-long':
      return outcome.error;
    case 'too-many':
      return outcome.error;
    case 'revision-moved':
      return typeof outcome.latest === 'number'
        ? `Revision ${outcome.latest} was confirmed from somewhere else while this screen was open. Nothing was`
          + ' overwritten. Reload the process and answer again on top of it.'
        : 'A newer revision was confirmed while this screen was open. Nothing was overwritten. Reload the process'
          + ' and answer again on top of it.';
    case 'no-baseline':
      return 'This process has not been reconstructed yet, so there is nothing to confirm. Open the process first.';
    case 'no-source':
      return 'This project has no source, so there is no need to confirm.';
    case 'source-moved':
      return 'The source changed since this process was reconstructed. Analyse it again before the need is confirmed.';
    case 'format-version':
      return 'This process was written in a shape this build cannot read, so nothing was confirmed.';
    case 'unreachable':
      // Two states share this code: the request never arrived, and it arrived
      // and was refused for a reason this build has no word for. The sentence
      // has to be true of both, so it claims neither.
      return 'This confirmation could not be stored, and the store gave no reason this build understands. Nothing'
        + ' was written and your answers are still on the screen.';
  }
}
