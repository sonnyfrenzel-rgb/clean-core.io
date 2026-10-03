import { doc, getDoc } from 'firebase/firestore';
import { announceShellProject } from './shell-context';
import { getAuth } from 'firebase/auth';
import { getDb } from './firebase';
import { Project } from './types';
import { isProjectOwner } from './project-readers';
import { readEconomicsRecord, type EconomicsRecord } from './economics-record';

/**
 * The project document with its active run spread over it.
 *
 * The run wins on every shared key except the three the preservation register
 * names, because those three are the reader's own interactive state and the run
 * knows nothing about them.
 */
function hydrate(data: Project, runData: Record<string, unknown>): Project {
  return {
    ...data,
    ...runData,
    // Merge runs results. Interactive fields like worklist and exports remain project-leading
    worklist: data.worklist || runData.worklist,
    extensibilityRoute: data.extensibilityRoute || runData.extensibilityRoute,
    exports: data.exports || runData.exports,
  } as Project;
}

/** How the read of the active run went. */
export type RunRead =
  | { kind: 'found'; data: Record<string, unknown> }
  | { kind: 'missing' }
  | { kind: 'failed'; error: string };

/**
 * The pure half of `loadProjectAndHydrate` — what a project document and the
 * read of its active run become, without Firestore (roadmap 3.0.2).
 *
 * Exported so that every historical form of a project can be put through
 * exactly the function the workspace opens it with, from a spec that has no
 * browser (`tests/legacy-projects.spec.ts`); a copy of this logic in a test
 * would prove the copy. Nothing here writes — the result is an object in
 * memory, and `_runLoadFailed` / `_runLoadError` are never persisted.
 *
 * `run` is `null` when no read was attempted: no `activeRunId`, the form of
 * every project stored before signed runs existed. It is returned as it is.
 */
export function hydrateProject(projectId: string, data: Project, run: RunRead | null): Project {
  let out: Project = data;
  if (run?.kind === 'found') {
    out = hydrate(data, run.data);
  } else if (run?.kind === 'missing') {
    // activeRunId points to a missing run — evidence-bearing fields (analysis, etc.)
    // live only in the run, so downstream pages must not silently render empty.
    out = { ...data, _runLoadFailed: true, _runLoadError: 'The active analysis run could not be found.' };
  } else if (run?.kind === 'failed') {
    // Do NOT swallow: the analysis narrative lives only in the run, so a failed
    // run read (e.g. Firestore rules gap, network) would otherwise show as an
    // empty Solution Design with no explanation. Flag it so callers can surface it.
    out = { ...data, _runLoadFailed: true, _runLoadError: run.error };
  }
  return { id: projectId, ...out } as Project;
}

/** What `GET /api/projects/{id}` answers with, as far as the loader reads it. */
export type ReaderAnswer = { activeRunId?: unknown; run?: Record<string, unknown> | null } | null;

/** Said when the project moved to another run between the two reads, twice in a row. */
export const RUN_MOVED_ERROR =
  'The project changed to another analysis run while it was loading. Reload the page to see the current run.';

/**
 * The reader's run, accepted only if it is the run the project document names.
 *
 * An invited reader reads the project document from Firestore and its run from
 * the server, in two reads. If the owner activates another run in between, the
 * server answers with that run — and spreading it over the document read first
 * would show one revision's source with another revision's findings (codex
 * architecture-01). The route returns the `activeRunId` it chose, so the two
 * are compared here, and the run's own `runId` too where the run carries one.
 * A mismatch is `moved`, never `found`.
 */
export function readerRunFor(expectedRunId: string, answer: ReaderAnswer): RunRead | { kind: 'moved' } {
  if (!answer) return { kind: 'missing' };
  if (answer.activeRunId !== expectedRunId) return { kind: 'moved' };
  const run = answer.run ?? null;
  if (!run) return { kind: 'missing' };
  if (typeof run.runId === 'string' && run.runId !== expectedRunId) return { kind: 'moved' };
  return { kind: 'found', data: run };
}

/**
 * Roadmap 5.4 — the run, for somebody who was invited to read the project.
 *
 * `firestore.rules` lets an invited reader read the project document; it leaves
 * `projects/{id}/runs/{runId}` owner-only, so the analysis narrative — which
 * lives only in the run — comes from the server instead. The route checks the
 * same `readers` list the rule checks, on the same document, so a revocation
 * closes both in the same instant.
 */
async function readerAnswer(projectId: string): Promise<ReaderAnswer> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error(READER_RUN_UNREAD_ERROR);
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readerAnswerOf(res.ok, await res.json().catch(() => undefined));
}

/** Said when the server could not be asked for the reader's run, or did not answer. */
export const READER_RUN_UNREAD_ERROR = 'The analysis run could not be read. Reload the page to try again.';

/**
 * A refused request or an unreadable body is a run that could not be read, not
 * a run that does not exist: the first is "failed" with a reason, the second
 * "missing" (QA review of 695850c7f838). Only a readable answer reaches
 * `readerRunFor`.
 */
export function readerAnswerOf(ok: boolean, body: unknown): NonNullable<ReaderAnswer> {
  if (!ok || !body || typeof body !== 'object') throw new Error(READER_RUN_UNREAD_ERROR);
  return body as NonNullable<ReaderAnswer>;
}

/** How the read of the stored Economics figures went. */
export type EconomicsRead = { kind: 'found'; record: EconomicsRecord | null } | { kind: 'failed' };

/**
 * The Economics figures stored for this project (owner report 03.10.2026).
 *
 * They sit at `projects/{id}/cost_assumptions/current`, which `firestore.rules`
 * leaves to the Admin SDK, so the read goes through the route — for the owner
 * and an invited reader alike. A refused or unreadable answer is `failed`, never
 * "nothing stored": the stage must not save an empty form over figures it
 * merely could not read.
 */
export async function readStoredEconomics(projectId: string): Promise<EconomicsRead> {
  try {
    // On a fresh page load the session is still being restored; the Firestore
    // reads wait for it on their own, a bare fetch has to.
    const auth = getAuth();
    await auth.authStateReady();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { kind: 'failed' };
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/cost-assumptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { kind: 'failed' };
    const body = (await res.json().catch(() => null)) as { record?: unknown } | null;
    if (!body || !('record' in body)) return { kind: 'failed' };
    return { kind: 'found', record: body.record === null ? null : readEconomicsRecord(body.record) };
  } catch {
    return { kind: 'failed' };
  }
}

/** The project with what the Economics read found — in memory only, never persisted. */
export function withEconomics(project: Project, read: EconomicsRead): Project {
  return read.kind === 'found'
    ? { ...project, _economics: read.record, _economicsLoadFailed: false }
    : { ...project, _economics: null, _economicsLoadFailed: true };
}

export async function loadProjectAndHydrate(projectId: string): Promise<Project | null> {
  const db = getDb();
  const docRef = doc(db, 'projects', projectId);
  const viewerUid = getAuth().currentUser?.uid ?? null;
  // Alongside the project and run reads, not after them: one more request on
  // every stage that opens, and no extra wait.
  const economics = readStoredEconomics(projectId);

  // Two attempts: a reader whose run moved between the project read and the
  // run read reads the project again once, and is told if it moved again.
  for (let attempt = 0; attempt < 2; attempt++) {
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;

    const data = docSnap.data() as Project;
    const owner = isProjectOwner(data, viewerUid);

    // Read only, in whatever form the document was stored (roadmap 3.0.2).
    // Nothing below writes to the project or its runs: a project without
    // `activeRunId` is returned as it is, and a run that cannot be read is
    // flagged in memory, never repaired.
    let run: RunRead | null = null;
    if (data.activeRunId) {
      try {
        // An invited reader never gets past the rules here, so they do not try:
        // a `permission-denied` in the console on every page load reads like a
        // fault, and this one would be the rules working as intended.
        let read: RunRead | { kind: 'moved' };
        if (owner) {
          const runSnap = await getDoc(doc(db, 'projects', projectId, 'runs', data.activeRunId));
          read = runSnap.exists() ? { kind: 'found', data: runSnap.data() as Record<string, unknown> } : { kind: 'missing' };
        } else {
          read = readerRunFor(data.activeRunId, await readerAnswer(projectId));
        }
        if (read.kind === 'moved') {
          if (attempt === 0) continue;
          run = { kind: 'failed', error: RUN_MOVED_ERROR };
        } else {
          if (read.kind === 'missing') {
            console.error(`Active run ${data.activeRunId} does not exist for project ${projectId}.`);
          }
          run = read;
        }
      } catch (err) {
        console.error('Failed to load active run:', err);
        run = { kind: 'failed', error: err instanceof Error ? err.message : 'Failed to load the analysis run.' };
      }
    }

    // The shell's path names the project (`DESIGN.md` §2.1) from this read —
    // the one every stage and the object page already make — rather than from a
    // read of its own, which would load the source code twice (`lib/shell-context.ts`).
    announceShellProject(projectId, data.name);

    return withEconomics(hydrateProject(docSnap.id, data, run), await economics);
  }
  return null;
}
