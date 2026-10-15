import { getAuth } from 'firebase/auth';
import {
  ARTEFACT_READ_ERROR,
  STORED_ARTEFACT_FIELDS,
  artefactIndexKey,
  artefactIndexOf,
  type StoredArtefactField,
} from './project-artefacts';

/**
 * The browser half of roadmap 3.0.14, item 9: the large artefacts of a project
 * (`lib/project-artefacts.ts`) come from `GET /api/projects/{id}/artefacts`,
 * never from Firestore — the rules leave their collection closed to every
 * browser, and the route admits the owner and an invited reader as the rules do
 * for the project document.
 *
 * Every place that reads a project document in the browser puts it through
 * `withStoredArtefacts` (or `withStoredArtefactRows` for a list), so a page
 * receives the shape it received before the move: `generatedCode`,
 * `documentation`, `businessDocumentation` and `testCases` on the project.
 * A project stored before 3.0.14 has no index and is returned as it is,
 * without a request.
 *
 * Reads are cached by project and index key: the key changes with every write
 * to the parts, so a cached answer is never one from before a write, and a
 * list that re-renders on every snapshot does not fetch the same artefacts
 * again.
 */

type Values = Partial<Record<StoredArtefactField, unknown>>;

const cache = new Map<string, Promise<Values>>();
const CACHE_LIMIT = 40;

/** The fields the index names and the document does not hold inline (inline wins, as on the server). */
function missingFields(data: Record<string, unknown>): StoredArtefactField[] {
  const index = artefactIndexOf(data);
  return STORED_ARTEFACT_FIELDS.filter((f) => index[f] && data[f] === undefined);
}

async function fetchArtefacts(projectId: string): Promise<Values> {
  const auth = getAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error(ARTEFACT_READ_ERROR);
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/artefacts`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as { artefacts?: unknown } | null;
  if (!res.ok || !body || !body.artefacts || typeof body.artefacts !== 'object') throw new Error(ARTEFACT_READ_ERROR);
  return body.artefacts as Values;
}

function readCached(projectId: string, key: string): Promise<Values> {
  const cacheKey = `${projectId}|${key}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  const pending = fetchArtefacts(projectId).catch((err) => {
    // A failed read is not remembered: the next render asks again.
    cache.delete(cacheKey);
    throw err;
  });
  cache.set(cacheKey, pending);
  return pending;
}

/**
 * The project document with its stored artefacts filled in. Throws when they
 * cannot be read (after one retry): a stage must say the read failed, never
 * draw an artefact as absent that is merely unread — the owner would be
 * invited to generate it again over the stored one.
 */
export async function withStoredArtefacts<T extends object>(projectId: string, data: T): Promise<T> {
  const missing = missingFields(data as Record<string, unknown>);
  if (missing.length === 0) return data;
  const key = artefactIndexKey(data);
  let values: Values;
  try {
    values = await readCached(projectId, key);
  } catch {
    values = await readCached(projectId, key);
  }
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const field of missing) {
    if (values[field] === undefined) throw new Error(ARTEFACT_READ_ERROR);
    out[field] = values[field];
  }
  return out as T;
}

/**
 * A list of project documents, each with its stored artefacts filled in — for
 * the dashboard and the workspace list, which read their phases from them.
 * A row whose artefacts cannot be read is kept as it was read and flagged
 * `_artefactsUnread`, so one failed request does not empty the whole list.
 */
export async function withStoredArtefactRows<T extends { id: string }>(rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map((row) =>
      withStoredArtefacts(row.id, row).catch(() => ({ ...row, _artefactsUnread: true }) as T),
    ),
  );
}

/** What `POST /api/projects/{id}/artefacts` answered. */
export type ArtefactStoreAnswer =
  | { ok: true; fields: Record<string, unknown>; kept?: string | null }
  | { ok: false; error: string; code: string | null };

/**
 * Hand an artefact a stage built to the server, which writes it where the
 * project keeps it (`lib/project-artefact-writes.ts` holds the preconditions
 * the stage's own transaction used to hold). The refusal's sentence is the
 * server's; a request that never got an answer says so.
 */
export async function storeArtefact(
  projectId: string,
  body: { action: 'documentation' | 'business-layer' | 'test-suite' } & Record<string, unknown>,
): Promise<ArtefactStoreAnswer> {
  const auth = getAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { ok: false, error: 'You are signed out. Sign in again and repeat the step; nothing was saved.', code: null };
  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/artefacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'The server could not be reached, so nothing was saved. Check the connection and try again.', code: null };
  }
  const answer = (await res.json().catch(() => null)) as { fields?: unknown; kept?: unknown; error?: unknown; code?: unknown } | null;
  if (!res.ok || !answer || !answer.fields || typeof answer.fields !== 'object') {
    return {
      ok: false,
      error: typeof answer?.error === 'string' ? answer.error : 'The server did not store this, so nothing was saved. Try again.',
      code: typeof answer?.code === 'string' ? answer.code : null,
    };
  }
  return {
    ok: true,
    fields: answer.fields as Record<string, unknown>,
    ...(answer.kept === null || typeof answer.kept === 'string' ? { kept: answer.kept } : {}),
  };
}
