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
      }
    } catch (err) {
      console.error('Failed to load active run, using fallback project fields:', err);
    }
  }
  
  return { id: docSnap.id, ...data } as Project;
}
