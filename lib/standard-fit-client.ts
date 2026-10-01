import { getAuth } from '@/lib/firebase';
import { isStandardFitView, type StandardFitView } from '@/lib/standard-fit-view';

/**
 * The browser half of the *Standard fit* layer — one GET.
 *
 * Never throws: a project with no source, a source too large and a network
 * failure are three states the table says in words, not exceptions.
 */
export type StandardFitOutcome =
  | { ok: true; view: StandardFitView }
  | { ok: false; code: 'no-source' | 'source-too-large' | 'unreachable' };

export async function fetchStandardFit(projectId: string): Promise<StandardFitOutcome> {
  try {
    const user = getAuth().currentUser;
    const headers: Record<string, string> = user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/standard-fit`, { headers });
    const body = (await res.json().catch(() => ({}))) as { view?: unknown; code?: unknown };
    if (res.ok && isStandardFitView(body.view)) return { ok: true, view: body.view };
    if (body.code === 'no-source' || body.code === 'source-too-large') return { ok: false, code: body.code };
    return { ok: false, code: 'unreachable' };
  } catch {
    return { ok: false, code: 'unreachable' };
  }
}
