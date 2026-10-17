import { getAuth } from 'firebase/auth';
import { callGemini } from '../gemini';
import type { ModelReceipt } from '../model-receipt';
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

/** One lease for one run of this project's generation, at the generation token the contract route handed out. */
export async function requestGenerationLease(projectId: string, generationToken: string, plannedCalls: number, runId: string): Promise<GenerationLease> {
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

/**
 * The fill model call under a lease: stage `transformation`, fill answer shape, aborted with the generation.
 *
 * `onReceipt` (roadmap 3.0.17, AI Act Art. 50(2)) is handed the receipt of every call that answered, so the page
 * can send the last one with the package: the server records provider and model of the generation from it.
 */
export function leasedFillModel(lease: LeaseReference, modelName: string = PRODUCT_GEMINI_MODEL, onReceipt?: (receipt: ModelReceipt) => void): FillModel {
  // A refusal comes back as `GeminiCallError` with `status` and `code`, which
  // the orchestrator reads (`modelErrorKind`) to retry, stop or give up a unit.
  // A repair of gate errors is marked (`meta.gateRepair`), so the server may count it against the lease's
  // gate-repair calls once the budget is used — never any other call (owner decision 14.10.2026).
  return (prompt, signal, meta) =>
    callGemini(prompt, modelName, true, 'transformation', signal, {
      lease: { projectId: lease.projectId, leaseId: lease.leaseId },
      responseShape: 'transformation-fill',
      ...(meta?.gateRepair ? { gateRepair: true } : {}),
      ...(onReceipt ? { onReceipt } : {}),
    });
}
