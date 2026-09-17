import { getAuth } from 'firebase/auth';
import type { ProjectReaderEntry } from '@/lib/project-readers';

/**
 * The browser's half of roadmap 5.5 — it asks, it never writes.
 *
 * `projects/{projectId}.readers` is what `firestore.rules` believes about who
 * may read a project, and it is deliberately absent from the client-writable
 * allowlist: a browser that could write it could grant itself the right to read
 * somebody's ABAP. Both calls below go through the Admin SDK behind
 * `/api/projects/{projectId}/readers`, which answers only the owner.
 */

export interface ProjectAccessList {
  entries: ProjectReaderEntry[];
  /** A uid on the list with no accepted invitation behind it — shown, not hidden. */
  unaccountedUids: string[];
}

function endpoint(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/readers`;
}

/** Who has Einsicht, and since when. `null` when the caller is not the owner. */
export async function loadProjectAccess(projectId: string): Promise<ProjectAccessList | null> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) return null;
  const res = await fetch(endpoint(projectId), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as ProjectAccessList | null;
  if (!json || !Array.isArray(json.entries)) return null;
  return { entries: json.entries, unaccountedUids: json.unaccountedUids ?? [] };
}

/**
 * Take the Einsicht away. Effective the moment this returns: the server has
 * written the one list the read rule consults, so the next client read of the
 * project by that account fails with `permission-denied`.
 */
export async function revokeProjectAccess(projectId: string, uid: string): Promise<void> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error('You are signed out. Sign in again and retry.');
  const res = await fetch(endpoint(projectId), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid }),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error || `The server refused the revocation (${res.status}).`);
}
