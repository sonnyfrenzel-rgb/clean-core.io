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

/** One lease for one generation of this project, at the generation token the contract route handed out. */
export async function requestGenerationLease(projectId: string, generationToken: string, plannedCalls: number): Promise<GenerationLease> {
  const token = await getAuth().currentUser?.getIdToken();
  const res = await fetch('/api/transformation/lease', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ projectId, generationToken, plannedCalls }),
  });
  const body = (await res.json().catch(() => null)) as { lease?: GenerationLease; error?: string; code?: string } | null;
  if (!res.ok || !body?.lease) {
    throw new LeaseRequestError(body?.error || `The generation could not be prepared (HTTP ${res.status}).`, res.status, body?.code);
  }
  return body.lease;
}

/** The fill model call under a lease: stage `transformation`, fill answer shape, aborted with the generation. */
export function leasedFillModel(lease: LeaseReference, modelName: string = PRODUCT_GEMINI_MODEL): FillModel {
  // A refusal comes back as `GeminiCallError` with `status` and `code`, which
  // the orchestrator reads (`modelErrorKind`) to retry, stop or give up a unit.
  return (prompt, signal) =>
    callGemini(prompt, modelName, true, 'transformation', signal, {
      lease: { projectId: lease.projectId, leaseId: lease.leaseId },
      responseShape: 'transformation-fill',
    });
}
