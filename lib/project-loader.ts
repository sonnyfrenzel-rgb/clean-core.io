import { doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getDb } from './firebase';
import { Project } from './types';
import { isProjectOwner } from './project-readers';

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

/**
 * Roadmap 5.4 — the run, for somebody who was invited to read the project.
 *
 * `firestore.rules` lets an invited reader read the project document; it leaves
 * `projects/{id}/runs/{runId}` owner-only, so the analysis narrative — which
 * lives only in the run — comes from the server instead. The route checks the
 * same `readers` list the rule checks, on the same document, so a revocation
 * closes both in the same instant.
 */
async function readerRun(projectId: string): Promise<Record<string, unknown> | null> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) return null;
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { run?: Record<string, unknown> | null } | null;
  return json?.run ?? null;
}

export async function loadProjectAndHydrate(projectId: string): Promise<Project | null> {
  const db = getDb();
  const docRef = doc(db, 'projects', projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;

  const data = docSnap.data() as Project;
  const viewerUid = getAuth().currentUser?.uid ?? null;
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
      const runSnap = owner
        ? await getDoc(doc(db, 'projects', projectId, 'runs', data.activeRunId))
        : null;
      const runData = owner
        ? (runSnap?.exists() ? (runSnap.data() as Record<string, unknown>) : null)
        : await readerRun(projectId);
      if (runData) {
        run = { kind: 'found', data: runData };
      } else {
        console.error(`Active run ${data.activeRunId} does not exist for project ${projectId}.`);
        run = { kind: 'missing' };
      }
    } catch (err) {
      console.error('Failed to load active run:', err);
      run = { kind: 'failed', error: err instanceof Error ? err.message : 'Failed to load the analysis run.' };
    }
  }

  return hydrateProject(docSnap.id, data, run);
}
