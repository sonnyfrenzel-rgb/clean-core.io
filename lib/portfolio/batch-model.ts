/**
 * The batch queue as data — roadmap 3.0.21 (1).
 *
 * A batch is `portfolio_batches/{batchId}` with one document per program under
 * `items/{itemId}`, both written only by the Admin SDK (no rule opens them to
 * a browser; `firestore.rules` denies by default). This module is the pure
 * half: the shapes, which item a step takes next, and the progress the list
 * prints — "what is done, running, failed and why". The routes and
 * `lib/portfolio/batch-store.ts` do the reading and writing.
 *
 * **Queued on the server.** The queue, its order, its limits and every
 * outcome live in Firestore; the server decides which program is next. Cloud
 * Run gives a request CPU only while it is answered, so the queue is worked by
 * step requests the progress page sends while it is open — each step signs up
 * to `PORTFOLIO_STEP_MAX_ITEMS` programs. A closed page pauses the batch; it
 * goes on where it stopped when the page is opened again, and a program a lost
 * step had taken is picked up again after `PORTFOLIO_STALE_CLAIM_MS`.
 */

import { PORTFOLIO_STALE_CLAIM_MS, PORTFOLIO_STEP_MAX_ITEMS } from './limits';

export type BatchItemStatus = 'queued' | 'running' | 'done' | 'failed';
export type BatchStatus = 'queued' | 'running' | 'done' | 'cancelled';

export interface BatchItem {
  id: string;
  /** Position in the upload, from 0 — the order the queue is worked in. */
  seq: number;
  name: string;
  fileName: string;
  /** The project made for it; `null` when the program was refused before a project existed. */
  projectId: string | null;
  status: BatchItemStatus;
  /** ms since epoch when a step took it; `null` while queued. */
  claimedAt: number | null;
  /** The signed run, when done. */
  runId: string | null;
  /** Why it failed — the sentence the run route or the pre-check gave. */
  reason: string | null;
  /** The refusal's code, where it had one. */
  code: string | null;
  /** Includes the program names and nobody uploaded. */
  missing: string[];
}

export interface Batch {
  id: string;
  userId: string;
  name: string;
  edition: 'public' | 'private';
  /** The Private Edition release the runs read; `''` reads the edition's latest list. */
  release: string;
  createdAt: number;
  status: BatchStatus;
  /** Programs the upload announced; the batch is complete when this many items exist. */
  total: number;
}

export interface BatchProgress {
  total: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  /** Nothing left to do — every item done or failed, or the batch cancelled. */
  finished: boolean;
}

export function progressOf(items: readonly Pick<BatchItem, 'status'>[], batch: Pick<Batch, 'status' | 'total'>): BatchProgress {
  const count = (s: BatchItemStatus) => items.filter((i) => i.status === s).length;
  const queued = count('queued');
  const running = count('running');
  const done = count('done');
  const failed = count('failed');
  return {
    total: Math.max(batch.total, items.length),
    queued,
    running,
    done,
    failed,
    finished: batch.status === 'cancelled' || (items.length >= batch.total && queued === 0 && running === 0),
  };
}

/** An item a step may take now: queued, or running so long that its step is gone. */
export function isClaimable(item: Pick<BatchItem, 'status' | 'claimedAt'>, now: number): boolean {
  if (item.status === 'queued') return true;
  return item.status === 'running' && (item.claimedAt === null || now - item.claimedAt > PORTFOLIO_STALE_CLAIM_MS);
}

/** The items the next step takes, in upload order. */
export function nextClaims<T extends Pick<BatchItem, 'status' | 'claimedAt' | 'seq'>>(
  items: readonly T[],
  now: number,
  max: number = PORTFOLIO_STEP_MAX_ITEMS,
): T[] {
  return items
    .filter((i) => isClaimable(i, now))
    .sort((a, b) => a.seq - b.seq)
    .slice(0, max);
}

/** What one signed-run attempt came back with, reduced to an item outcome. */
export function outcomeOfRun(
  status: number,
  body: { runId?: unknown; error?: unknown; code?: unknown } | null,
): { status: 'done'; runId: string } | { status: 'failed'; reason: string; code: string | null } {
  if (status >= 200 && status < 300 && body && typeof body.runId === 'string' && body.runId) {
    return { status: 'done', runId: body.runId };
  }
  const reason =
    body && typeof body.error === 'string' && body.error.trim()
      ? body.error.trim().slice(0, 600)
      : `The run could not be signed (HTTP ${status}).`;
  return { status: 'failed', reason, code: body && typeof body.code === 'string' ? body.code.slice(0, 60) : null };
}

/** A stored item, read defensively — a field of the wrong type reads as absent. */
export function itemOfStored(id: string, data: Record<string, unknown>): BatchItem {
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  const status = data.status;
  return {
    id,
    seq: typeof data.seq === 'number' ? data.seq : 0,
    name: str(data.name) ?? '',
    fileName: str(data.fileName) ?? '',
    projectId: str(data.projectId),
    status: status === 'running' || status === 'done' || status === 'failed' ? status : 'queued',
    claimedAt: typeof data.claimedAt === 'number' ? data.claimedAt : null,
    runId: str(data.runId),
    reason: str(data.reason),
    code: str(data.code),
    missing: Array.isArray(data.missing) ? data.missing.filter((m): m is string => typeof m === 'string') : [],
  };
}

export function batchOfStored(id: string, data: Record<string, unknown>): Batch {
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    name: typeof data.name === 'string' ? data.name : '',
    edition: data.edition === 'private' ? 'private' : 'public',
    release: typeof data.release === 'string' ? data.release : '',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    status: data.status === 'running' || data.status === 'done' || data.status === 'cancelled' ? data.status : 'queued',
    total: typeof data.total === 'number' ? data.total : 0,
  };
}

/** Programs counted against the daily limit: those of batches created in the window. */
export function programsInWindow(batches: readonly Pick<Batch, 'createdAt' | 'total'>[], now: number, windowMs: number): number {
  return batches.filter((b) => now - b.createdAt < windowMs).reduce((n, b) => n + b.total, 0);
}

/** A batch still holding the account's one queue. */
export function isOpenBatch(batch: Pick<Batch, 'status'>, progress: Pick<BatchProgress, 'finished'>): boolean {
  return batch.status !== 'cancelled' && batch.status !== 'done' && !progress.finished;
}
