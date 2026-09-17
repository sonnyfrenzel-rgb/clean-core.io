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
      code: (body.code as SaveRevisionRefusal) || 'unreachable',
      error: body.error || `This revision could not be saved (${res.status}).`,
      status: res.status,
      ...(typeof body.latest === 'number' ? { latest: body.latest } : {}),
    };
  } catch {
    return { ok: false, code: 'unreachable', error: 'This revision could not be saved.', status: 0 };
  }
}
