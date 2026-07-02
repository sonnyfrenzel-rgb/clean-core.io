import { doc, getDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import { Project } from './types';

export async function loadProjectAndHydrate(projectId: string): Promise<Project | null> {
  const db = getDb();
  const docRef = doc(db, 'projects', projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  
  let data = docSnap.data() as Project;
  
  if (data.activeRunId) {
    try {
      const runRef = doc(db, 'projects', projectId, 'runs', data.activeRunId);
      const runSnap = await getDoc(runRef);
      if (runSnap.exists()) {
        const runData = runSnap.data();
        data = {
          ...data,
          ...runData,
          // Merge runs results. Interactive fields like worklist and exports remain project-leading
          worklist: data.worklist || runData.worklist,
          extensibilityRoute: data.extensibilityRoute || runData.extensibilityRoute,
          exports: data.exports || runData.exports,
        } as Project;
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
