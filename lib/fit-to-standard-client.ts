import { getAuth } from '@/lib/firebase';
import type { FitToStandardGate } from '@/lib/fit-to-standard-gate';
import type { FitToStandardDesign } from '@/lib/fit-to-standard-design';
import type { FitChoice, FitToStandardRevision, FitToStandardSummary } from '@/lib/fit-to-standard-store';

/**
 * The browser half of fit to standard (roadmap 3.0.20) — one GET and one POST
 * to `/api/projects/{id}/fit-to-standard`.
 *
 * Never throws: every failure is a state the screen says in words. The GET is
 * shared for a few seconds per project and run, so the offer card and the Design
 * panel on one page make one request.
 */

export interface FitToStandardRead {
  gate: FitToStandardGate;
  /** The stored revision on the current run, or the engine's preview; `null` when the gate does not offer. */
  design: (FitToStandardDesign | (FitToStandardRevision & { counts: FitToStandardDesign['counts'] })) | null;
  stored: { revision: number; kind: 'engine' | 'confirmation'; stale: boolean; createdAt: string; createdBy: string } | null;
}

export type FitReadOutcome =
  | { ok: true; value: FitToStandardRead }
  | { ok: false; code: 'no-source' | 'source-too-large' | 'unreachable' };

export type FitWriteOutcome =
  | { ok: true; design: FitToStandardRevision; summary: FitToStandardSummary }
  | { ok: false; code: string; error: string };

const cache = new Map<string, { at: number; promise: Promise<FitReadOutcome> }>();
const SHARE_MS = 5_000;

async function headers(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {};
}

const isGate = (g: unknown): g is FitToStandardGate =>
  !!g && typeof g === 'object' && ['offered', 'not-offered', 'not-determined'].includes((g as { outcome?: string }).outcome ?? '');

export function fetchFitToStandard(projectId: string, runKey: string): Promise<FitReadOutcome> {
  const key = `${projectId}::${runKey}`;
  const held = cache.get(key);
  if (held && Date.now() - held.at < SHARE_MS) return held.promise;
  const promise = (async (): Promise<FitReadOutcome> => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/fit-to-standard`, { headers: await headers() });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok && isGate(body.gate)) return { ok: true, value: body as unknown as FitToStandardRead };
      if (body.code === 'no-source' || body.code === 'source-too-large') return { ok: false, code: body.code };
      return { ok: false, code: 'unreachable' };
    } catch {
      return { ok: false, code: 'unreachable' };
    }
  })();
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** The files of the package without code (F7), for the confirmed design on the current run. */
export async function fetchFitPackage(
  projectId: string,
): Promise<{ ok: true; value: { files: Array<{ path: string; content: string }>; conditions: string[]; summary: string } } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/fit-to-standard?files=1`, { headers: await headers() });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && Array.isArray(body.files) && Array.isArray(body.conditions) && typeof body.summary === 'string') {
      return { ok: true, value: body as unknown as { files: Array<{ path: string; content: string }>; conditions: string[]; summary: string } };
    }
    return { ok: false, error: typeof body.error === 'string' ? body.error : 'The fit-to-standard files could not be read.' };
  } catch {
    return { ok: false, error: 'The server could not be reached.' };
  }
}

export async function postFitToStandard(
  projectId: string,
  body: { action: 'make'; againstGate?: boolean } | { action: 'confirm'; baseRevision: number; choices: FitChoice[] },
): Promise<FitWriteOutcome> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/fit-to-standard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await headers()) },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    for (const key of [...cache.keys()]) if (key.startsWith(`${projectId}::`)) cache.delete(key);
    if (res.ok && out.design && out.summary) {
      return { ok: true, design: out.design as FitToStandardRevision, summary: out.summary as FitToStandardSummary };
    }
    return { ok: false, code: typeof out.code === 'string' ? out.code : 'unreachable', error: typeof out.error === 'string' ? out.error : 'The design could not be stored.' };
  } catch {
    return { ok: false, code: 'unreachable', error: 'The server could not be reached.' };
  }
}
