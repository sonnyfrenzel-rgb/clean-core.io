import { getAuth } from 'firebase/auth';
import { callGemini } from '../gemini';
import { PRODUCT_GEMINI_MODEL } from '../constants';
import type { LeaseReference } from './lease';
import type { FillModel } from './orchestrator';

/**
 * The browser's half of the generation lease (`lib/transformation/lease.ts`):
 * buy the lease for one generation, and the model call the orchestrator uses
 * under it. Keys never reach the browser — every call goes through
 * `/api/gemini`, which counts it against the lease.
 */

export interface GenerationLease extends LeaseReference {
  budget: number;
  used: number;
  /** Calls held for repairs of gate errors (owner decision 14.10.2026); absent from a server before: none. */
  gateRepairBudget?: number;
  gateRepairUsed?: number;
  expiresAt: number;
  maxInFlight: number;
}

export class LeaseRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'LeaseRequestError';
  }
}

/**
 * A fresh id for one click of *Generate*. The lease route returns an open lease
 * only to the run it was issued to, so a restart after *Cancel* never inherits
 * the in-flight slots the cancelled run's calls still hold (13.10.2026).
 */
export function newGenerationRunId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const cancelled = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });

/**
 * One lease for one run of this project's generation, at the generation token the contract route handed out.
 *
 * Under the generation's signal (3.0.18): *Cancel* while the request is pending ends the wait at once with an
 * `AbortError`. The request itself is not torn down — the server may already have issued and charged the lease,
 * and only its answer names it — so a lease that arrives after the cancel is closed as soon as it arrives
 * (`closeLate`, `closeGenerationLease` by default) and never handed to the generation.
 */
export async function requestGenerationLease(
  projectId: string,
  generationToken: string,
  plannedCalls: number,
  runId: string,
  signal?: AbortSignal,
  closeLate: (lease: LeaseReference) => void = closeGenerationLease,
): Promise<GenerationLease> {
  if (signal?.aborted) throw cancelled();
  const request = (async () => {
    const res = await fetch('/api/transformation/lease', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ projectId, generationToken, plannedCalls, runId }),
    });
    const body = (await res.json().catch(() => null)) as { lease?: GenerationLease; error?: string; code?: string } | null;
    if (!res.ok || !body?.lease) {
      throw new LeaseRequestError(body?.error || `The generation could not be prepared (HTTP ${res.status}).`, res.status, body?.code);
    }
    return body.lease;
  })();
  if (!signal) return request;
  return new Promise<GenerationLease>((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    request.then(
      (lease) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) {
          closeLate(lease);
          reject(cancelled());
        } else resolve(lease);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.aborted ? cancelled() : err);
      },
    );
  });
}

/**
 * *Cancel*: close the run's lease on the server. Best effort and never awaited
 * by the screen — a close that fails leaves a lease the next run supersedes
 * anyway. `keepalive` lets it finish when the tab is closed.
 */
export function closeGenerationLease(lease: LeaseReference): void {
  void (async () => {
    try {
      await fetch('/api/transformation/lease', {
        method: 'DELETE',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ projectId: lease.projectId, leaseId: lease.leaseId }),
      });
    } catch {
      /* best effort: the next run supersedes it */
    }
  })();
}

export interface GenerationWindow {
  used: number;
  limit: number;
  nextFreeInSeconds: number | null;
}

/** The account's generations this hour (`GET /api/transformation/lease`), or null when they could not be read. */
export async function readGenerationWindow(): Promise<GenerationWindow | null> {
  try {
    const res = await fetch('/api/transformation/lease', { headers: await authHeaders() });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { window?: { used?: unknown; limit?: unknown; nextFreeInSeconds?: unknown } } | null;
    const w = body?.window;
    if (!w || typeof w.used !== 'number' || typeof w.limit !== 'number') return null;
    return { used: w.used, limit: w.limit, nextFreeInSeconds: typeof w.nextFreeInSeconds === 'number' ? w.nextFreeInSeconds : null };
  } catch {
    return null;
  }
}

/** The fill model call under a lease: stage `transformation`, fill answer shape, aborted with the generation. */
export function leasedFillModel(lease: LeaseReference, modelName: string = PRODUCT_GEMINI_MODEL): FillModel {
  // A refusal comes back as `GeminiCallError` with `status` and `code`, which
  // the orchestrator reads (`modelErrorKind`) to retry, stop or give up a unit.
  // A repair of gate errors is marked (`meta.gateRepair`), so the server may count it against the lease's
  // gate-repair calls once the budget is used — never any other call (owner decision 14.10.2026).
  return (prompt, signal, meta) =>
    callGemini(prompt, modelName, true, 'transformation', signal, {
      lease: { projectId: lease.projectId, leaseId: lease.leaseId },
      responseShape: 'transformation-fill',
      ...(meta?.gateRepair ? { gateRepair: true } : {}),
    });
}
