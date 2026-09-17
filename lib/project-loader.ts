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

  let data = docSnap.data() as Project;
  const viewerUid = getAuth().currentUser?.uid ?? null;
  const owner = isProjectOwner(data, viewerUid);

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
        data = hydrate(data, runData);
      } else {
        // activeRunId points to a missing run — evidence-bearing fields (analysis, etc.)
        // live only in the run, so downstream pages must not silently render empty.
        console.error(`Active run ${data.activeRunId} does not exist for project ${projectId}.`);
        data._runLoadFailed = true;
        data._runLoadError = 'The active analysis run could not be found.';
      }
    } catch (err) {
      // Do NOT swallow: the analysis narrative lives only in the run, so a failed
      // run read (e.g. Firestore rules gap, network) would otherwise show as an
      // empty Solution Design with no explanation. Flag it so callers can surface it.
      console.error('Failed to load active run:', err);
      data._runLoadFailed = true;
      data._runLoadError = err instanceof Error ? err.message : 'Failed to load the analysis run.';
    }
  }

  return { id: docSnap.id, ...data } as Project;
}
