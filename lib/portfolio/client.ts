import { getAuth } from '@/lib/firebase';
import type { PortfolioView } from './aggregate';
import type { Batch, BatchItem, BatchProgress } from './batch-model';
import type { BatchProgram } from './batch-split';
import type { PortfolioAccess } from './access';

/**
 * The browser's calls to `/api/portfolio/*` — roadmap 3.0.21. One place for
 * the token, the JSON and the refusal sentence, so the components only say
 * what they ask for. A refusal is thrown with the route's own sentence.
 */

export class PortfolioRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'PortfolioRequestError';
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: unknown; code?: unknown }) | null;
  if (!res.ok) {
    const message = body && typeof body.error === 'string' && body.error ? body.error : `The request failed (HTTP ${res.status}).`;
    throw new PortfolioRequestError(message, res.status, body && typeof body.code === 'string' ? body.code : null);
  }
  return body as T;
}

export interface BatchState {
  batch: Batch;
  items: BatchItem[];
  progress: BatchProgress;
}

export interface OverviewState {
  view: PortfolioView;
  openable: string[];
  truncated: boolean;
  role: 'owner' | 'reader';
  name?: string;
}

export interface SelectionSummary {
  id: string;
  name: string;
  projectIds: string[];
  createdAt: number;
  readers: number;
}

/** Who a selection is shared with, and which of its projects each of them sees. */
export interface SelectionSharing {
  projectIds: string[];
  waiting: { id: string; email: string; expiresAt: string; projectIds: string[] }[];
  readers: { id: string; email: string; acceptedAt: string | null; projectIds: string[] }[];
  /** Projects of the selection that at least one of them does not see. */
  unreleased: string[];
}

export const portfolioApi = {
  access: () => call<PortfolioAccess>('/api/portfolio/access'),
  batches: () => call<{ batches: BatchState[] }>('/api/portfolio/batches'),
  createBatch: (header: { name: string; edition: 'public' | 'private'; release: string; total: number }, programs: BatchProgram[]) =>
    call<{ batchId: string; appended: number }>('/api/portfolio/batches', {
      method: 'POST',
      body: JSON.stringify({ ...header, programs: programs.map(wire) }),
    }),
  append: (batchId: string, programs: BatchProgram[]) =>
    call<{ appended: number }>(`/api/portfolio/batches/${batchId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'append', programs: programs.map(wire) }),
    }),
  step: (batchId: string) =>
    call<BatchState>(`/api/portfolio/batches/${batchId}`, { method: 'POST', body: JSON.stringify({ action: 'step' }) }),
  cancel: (batchId: string) =>
    call<BatchState>(`/api/portfolio/batches/${batchId}`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }),
  removeBatch: (batchId: string) => call<{ deleted: boolean }>(`/api/portfolio/batches/${batchId}`, { method: 'DELETE' }),
  overview: (selectionId?: string) =>
    call<OverviewState>(selectionId ? `/api/portfolio/view?selection=${encodeURIComponent(selectionId)}` : '/api/portfolio/view'),
  selections: () => call<{ selections: SelectionSummary[] }>('/api/portfolio/selections'),
  createSelection: (name: string, projectIds: string[]) =>
    call<{ selection: SelectionSummary }>('/api/portfolio/selections', { method: 'POST', body: JSON.stringify({ name, projectIds }) }),
  deleteSelection: (id: string) => call<{ deleted: boolean }>(`/api/portfolio/selections/${id}`, { method: 'DELETE' }),
  updateSelection: (id: string, projectIds: string[]) =>
    call<{ projectIds: string[] }>(`/api/portfolio/selections/${id}`, { method: 'PATCH', body: JSON.stringify({ projectIds }) }),
  releaseSelection: (id: string) =>
    call<{ projectIds: string[] }>(`/api/portfolio/selections/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'release' }) }),
  sharing: (id: string) => call<SelectionSharing>(`/api/portfolio/selections/${id}/invitations`),
  invite: (id: string, email: string) =>
    call<{ invitation: { id: string; email: string; expiresAt: string } }>(`/api/portfolio/selections/${id}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  withdraw: (id: string, invitationId: string) =>
    call<{ withdrawn: boolean }>(`/api/portfolio/selections/${id}/invitations/${invitationId}`, { method: 'DELETE' }),
  previewInvitation: (id: string, invitationId: string) =>
    call<{ invitedBy: string; expiresAt: string }>(`/api/portfolio/selections/${id}/invitations/${invitationId}/accept`),
  acceptInvitation: (id: string, invitationId: string) =>
    call<{ accepted: boolean; selectionId: string; name: string }>(`/api/portfolio/selections/${id}/invitations/${invitationId}/accept`, {
      method: 'POST',
      body: '{}',
    }),
};

/** What one program sends: the four fields the server checks, nothing else. */
function wire(p: BatchProgram) {
  return { name: p.name, fileName: p.fileName, source: p.source, missing: p.missing };
}

/** Programs per upload request, kept under the server's body limit with room. */
export function uploadChunks(programs: BatchProgram[], maxBytes = 1_500_000): BatchProgram[][] {
  const chunks: BatchProgram[][] = [];
  let current: BatchProgram[] = [];
  let size = 0;
  for (const p of programs) {
    // Measured as it will travel: JSON escapes newlines and quotes.
    const bytes = new TextEncoder().encode(JSON.stringify(wire(p))).length + 2;
    if (current.length > 0 && size + bytes > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
