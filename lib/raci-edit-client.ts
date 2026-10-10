import { getAuth } from '@/lib/firebase';
import { readRaciEditRecord, type RaciEditPayload, type RaciEditRecord } from '@/lib/raci-edit';

/**
 * The browser half of the owner's RACI (`app/api/projects/[projectId]/raci`).
 * Neither function throws for an ordinary outcome: a refusal is a sentence the
 * stage shows beside the editor.
 */

export function raciEditPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/raci`;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** The stored edit, or null when there is none or it cannot be read. */
export async function fetchRaciEdit(projectId: string): Promise<RaciEditRecord | null> {
  try {
    const res = await fetch(raciEditPath(projectId), { headers: await authHeader() });
    if (!res.ok) return null;
    const body = (await res.json()) as { record?: unknown };
    return readRaciEditRecord(body.record);
  } catch {
    return null;
  }
}

export type RaciSaveOutcome =
  | { ok: true; record: RaciEditRecord }
  | { ok: false; code: string; message: string };

/** Store the owner's RACI; the server checks the revision and the proposal it was made on. */
export async function saveRaciEdit(projectId: string, payload: RaciEditPayload): Promise<RaciSaveOutcome> {
  try {
    const res = await fetch(raciEditPath(projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { record?: unknown; error?: string; code?: string };
    const record = res.ok ? readRaciEditRecord(body.record) : null;
    if (record) return { ok: true, record };
    return { ok: false, code: body.code ?? String(res.status), message: body.error || `The RACI could not be saved (${res.status}).` };
  } catch (err: unknown) {
    return { ok: false, code: 'network', message: err instanceof Error ? err.message : 'The RACI could not be saved.' };
  }
}
