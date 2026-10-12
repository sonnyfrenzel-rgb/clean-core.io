import { buildReadingExports, type BpmnExport } from './export';
import { processSummaryOf, type ProcessSummary } from '../process-summary';
import type { ReadingOptions } from './reading-key';

/**
 * The work the reading worker does, as plain functions — so the worker file is
 * three lines, the main-thread fallback runs exactly the same code, and a test
 * calls the handler directly without a browser.
 *
 * Why a worker at all (owner, 12.10.2026: the CO project froze the
 * Documentation tool): laying out and routing a 2,000-line program takes
 * 10 s and more (`buildReadingExports`, almost all of it in the router), and on
 * the main thread that is Chrome's "Page not responding". The result is the
 * same — the same functions on the same input; only the thread differs.
 */
export type ReadingJob =
  | { kind: 'reading'; source: string; options: ReadingOptions }
  | { kind: 'summary'; source: string; fileName: string; processName?: string };

export interface ReadingRequest {
  id: number;
  job: ReadingJob;
}

export type ReadingResponse = { id: number; result: unknown } | { id: number; error: string };

export type ReadingResult = { bpmn: BpmnExport; technical: BpmnExport };

/** One job, run here. Throws what the reader throws. */
export function runReadingJob(job: ReadingJob): ReadingResult | ProcessSummary | null {
  if (job.kind === 'reading') return buildReadingExports(job.source, job.options);
  if (job.kind === 'summary') return processSummaryOf(job.source, job.fileName, job.processName);
  throw new Error(`Unknown reading job: ${(job as { kind?: unknown }).kind}`);
}

/**
 * The worker's message handler: a request in, one response out, never a throw —
 * an error becomes `{ id, error }` so the page can say the map could not be
 * read instead of waiting for an answer that will not come.
 */
export function handleReadingRequest(request: ReadingRequest): ReadingResponse {
  const id = typeof request?.id === 'number' ? request.id : -1;
  try {
    return { id, result: runReadingJob(request.job) };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message || 'The process could not be read.' : String(error) };
  }
}
