import type { ProjectInShort } from '@/lib/project-in-short';

/**
 * The server half of "In short" (`lib/project-in-short.ts`, AB-14c data in v3.2.0): writing it with the Admin SDK.
 *
 * The one key `inShort` of the project document — never a run, never an audit pack. `inShort` is on neither client
 * allowlist of `/projects/{projectId}` in `firestore.rules` (the update rule's `affectedKeys().hasOnly([...])`), so no
 * browser can write or change it. A failure here fails nothing else: the Continue card then shows no "In short".
 */

type AdminDb = FirebaseFirestore.Firestore;

/** Writes the whole record — after a signed run. */
export async function writeProjectInShort(db: AdminDb, projectId: string, record: ProjectInShort): Promise<void> {
  await db.collection('projects').doc(projectId).update({ inShort: record });
}
