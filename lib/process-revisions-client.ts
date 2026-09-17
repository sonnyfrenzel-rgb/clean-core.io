import { getAuth } from '@/lib/firebase';
import {
  isProcessRevisionRecord,
  isProcessRevisionSummary,
  type ProcessRevisionRecord,
  type ProcessRevisionSummary,
} from '@/lib/process-revisions';

/**
 * The browser half of roadmap 3.2 — the four calls an editor makes.
 *
 * ```ts
 * const baseline = await ensureProcessBaseline(projectId);   // revision 1, reconstructed
 * const history  = await fetchProcessRevisions(projectId);   // the list, without the BPMN
 * const opened   = await fetchProcessRevision(projectId, 2); // one revision, with its BPMN
 *
 * const saved = await saveProcessRevision(projectId, xml, opened.revision);
 * if (saved.ok) setOpened(saved.record);                     // saved.created says whether a row was added
 * else showRefusal(saved.error);                             // and saved.latest, when someone else saved first
 * ```
 *
 * `saveProcessRevision` never throws for an ordinary outcome. Saving the same
 * bytes twice, a revision somebody else saved in the meantime, a model too large
 * for the store and a project with no signed run are all states the editor shows
 * — not exceptions it has to catch.
 */

export function processRevisionsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/process-revisions`;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** The history of a project, oldest first. Empty when there is none or it cannot be read. */
export async function fetchProcessRevisions(projectId: string): Promise<ProcessRevisionSummary[]> {
  try {
    const res = await fetch(processRevisionsPath(projectId), { headers: await authHeader() });
    if (!res.ok) return [];
    const body = (await res.json()) as { revisions?: unknown };
    return Array.isArray(body.revisions) ? body.revisions.filter(isProcessRevisionSummary) : [];
  } catch {
    return [];
  }
}

/** One revision with its BPMN, or null when there is no such revision. */
export async function fetchProcessRevision(
  projectId: string,
  revision: number,
): Promise<ProcessRevisionRecord | null> {
  try {
    const res = await fetch(`${processRevisionsPath(projectId)}?revision=${encodeURIComponent(String(revision))}`, {
      headers: await authHeader(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { record?: unknown };
    return isProcessRevisionRecord(body.record) ? body.record : null;
  } catch {
    return null;
  }
}

/** Why a save produced no new revision. */
export type SaveRevisionRefusal =
  | 'bad-request'
  | 'too-large'
  | 'not-bpmn'
  | 'revision-moved'
  | 'no-source'
  | 'no-run'
  /**
   * The project points at a run, and that run could not be shown to be the run
   * that signed its source: no such document, one that names another project,
   * or one whose HMAC does not check out. Revision 1 is the Ist of a signed run
   * or it is nothing, so no reconstruction is written.
   */
  | 'run-unverified'
  | 'source-moved'
  | 'format-version'
  | 'unreachable';

export type SaveRevisionOutcome =
  | {
    ok: true;
    record: ProcessRevisionRecord;
    /** False when the same bytes were already the newest revision — nothing was written. */
    created: boolean;
  }
  | {
    ok: false;
    code: SaveRevisionRefusal;
    error: string;
    status: number;
    /** The newest revision on the server, when the refusal is `revision-moved`. */
    latest?: number;
  };

/**
 * Reconstruct revision 1 if the project has none, and return it.
 *
 * The Ist is built on the server out of the source the active run signed; this
 * call only asks for it to exist. It is safe to call on every open — a project
 * that already has revision 1 is not reconstructed again.
 */
export async function ensureProcessBaseline(projectId: string): Promise<SaveRevisionOutcome> {
  return post(projectId, {});
}

/**
 * Save a model as the next revision.
 *
 * `baseRevision` is the revision the editor was opened from. When somebody else
 * has saved since, nothing is written and the outcome carries `latest`.
 *
 * Saving bytes identical to the newest revision writes nothing and answers with
 * that revision and `created: false`: a row saying nothing changed is noise, and
 * a retried save must not become a second revision.
 */
export async function saveProcessRevision(
  projectId: string,
  xml: string,
  baseRevision: number,
): Promise<SaveRevisionOutcome> {
  return post(projectId, { xml, baseRevision });
}

/** The refusals this build knows, as values — the union above, once. */
export const SAVE_REVISION_REFUSALS: readonly SaveRevisionRefusal[] = Object.freeze([
  'bad-request',
  'too-large',
  'not-bpmn',
  'revision-moved',
  'no-source',
  'no-run',
  'run-unverified',
  'source-moved',
  'format-version',
  'unreachable',
] as SaveRevisionRefusal[]);

function isSaveRevisionRefusal(value: unknown): value is SaveRevisionRefusal {
  return typeof value === 'string' && (SAVE_REVISION_REFUSALS as readonly string[]).includes(value);
}

/**
 * One outcome, one sentence a reader can act on.
 *
 * A screen that prints `code` prints a word nobody outside this file knows, and
 * a screen that prints the server's `error` prints a sentence written for the
 * next programmer. So the translation lives here, next to the codes it covers,
 * where it is asserted without a browser — and every code has a case, because
 * the parameter is the union and TypeScript refuses a `switch` that misses one.
 *
 * Two things it is careful about:
 *
 *   - **`created: false` is not a failure.** Saving bytes that are already the
 *     newest revision writes nothing on purpose. The sentence says nothing
 *     changed; it does not apologise for an error that did not happen.
 *   - **`revision-moved` says what to do.** Somebody else saved while this tab
 *     was open. "Could not be saved" leaves the reader with a draft and no next
 *     move, so the sentence names the revision to open.
 */
export function revisionOutcomeSentence(outcome: SaveRevisionOutcome): string {
  if (outcome.ok) {
    return outcome.created
      ? `Saved as revision ${outcome.record.revision}.`
      : `Nothing has changed since revision ${outcome.record.revision}, so no new revision was written.`;
  }
  switch (outcome.code) {
    case 'bad-request':
      return 'This model was not accepted by the store. Reload the page and try saving again.';
    case 'too-large':
      return 'This model is too large to keep as a revision. Remove some elements and save again.';
    case 'not-bpmn':
      return 'This draft is not a BPMN 2.0 document, so nothing was saved.';
    case 'revision-moved':
      return typeof outcome.latest === 'number'
        ? `Revision ${outcome.latest} was saved from somewhere else while this draft was open. Nothing was overwritten.`
          + ` Reload the process, open revision ${outcome.latest} and apply your change to it.`
        : 'A newer revision was saved while this draft was open. Nothing was overwritten. Reload the process and'
          + ' apply your change to the newer revision.';
    case 'no-source':
      return 'This project has no source, so there is no process to keep a revision of.';
    case 'no-run':
      return 'This project has no active analysis run. Analyse the source again, then save.';
    case 'run-unverified':
      return 'The analysis run this project points at could not be verified as the run that signed its source.'
        + ' Nothing was saved — analyse the source again, then save.';
    case 'source-moved':
      return 'The source changed since the run signed it. Analyse it again before a revision is kept.';
    case 'format-version':
      return 'The first revision of this process was written in a shape this build cannot read, so nothing was saved.';
    case 'unreachable':
      // Two states share this code: the request never arrived, and it arrived
      // and was refused for a reason this build has no word for. The sentence
      // has to be true of both, so it claims neither.
      return 'This revision could not be saved, and the store gave no reason this build understands. Nothing was'
        + ' written and your draft is still on the canvas.';
  }
}

async function post(projectId: string, payload: Record<string, unknown>): Promise<SaveRevisionOutcome> {
  try {
    const res = await fetch(processRevisionsPath(projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as {
      record?: unknown;
      created?: unknown;
      error?: string;
      code?: string;
      latest?: unknown;
    };
    if (res.ok && isProcessRevisionRecord(body.record)) {
      return { ok: true, record: body.record, created: body.created === true };
    }
    return {
      ok: false,
      // A code this build does not know is not a code. It used to be passed
      // through as one, so a newer server — or a proxy answering with its own
      // JSON — could put a value in the union that nothing here has a sentence
      // for, and the sentence came out `undefined`.
      code: isSaveRevisionRefusal(body.code) ? body.code : 'unreachable',
      error: body.error || `This revision could not be saved (${res.status}).`,
      status: res.status,
      ...(typeof body.latest === 'number' ? { latest: body.latest } : {}),
    };
  } catch {
    return { ok: false, code: 'unreachable', error: 'This revision could not be saved.', status: 0 };
  }
}
