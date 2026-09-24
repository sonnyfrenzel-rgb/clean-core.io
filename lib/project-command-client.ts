import { getAuth } from 'firebase/auth';
import type { ProjectCommandBody } from '@/lib/project-commands';

/**
 * The browser's half of roadmap 0.7: it asks, it does not write.
 *
 * The six fields this reaches — the five release fields and `usageReport` —
 * left the client-writable allowlist in `firestore.rules`. There is exactly one
 * way for a page to change them, and this is it.
 *
 * The answer carries the fields the server actually stored, so a page updates
 * its local state from the record rather than from what it hoped it wrote: the
 * address on a sign-off comes off the ID token and the timestamp off the server
 * clock, and neither is the browser's to guess.
 */
/**
 * The request may have reached the server and no answer came back, so whether
 * the command was applied is not known. A page must not report that as "nothing
 * was written"; it reads the record again instead.
 */
export class CommandAnswerLostError extends Error {}

export async function runProjectCommand(
  projectId: string,
  body: ProjectCommandBody,
): Promise<Record<string, unknown>> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error('You are signed out. Sign in again and retry.');

  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CommandAnswerLostError('No answer came back from the server, so it is not known whether the command was applied.');
  }
  const json = (await res.json().catch(() => null)) as { error?: string; fields?: Record<string, unknown> } | null;
  if (!res.ok) throw new Error(json?.error || `The server refused the command (${res.status}).`);
  return json?.fields ?? {};
}
