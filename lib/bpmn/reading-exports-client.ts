import type { ProcessSummary } from '../process-summary';
import type { PhoneView, ReadingJob, ReadingRequest, ReadingResponse, ReadingResult } from './reading-exports-job';
import { readingExportsKey, type ReadingOptions } from './reading-key';

/**
 * The page's side of the reading worker (owner, 12.10.2026: the CO project
 * froze the Documentation tool — `buildReadingExports` took 11–13 s on the
 * main thread, and Chrome offered to kill the page).
 *
 * - **One worker per tab**, started on the first request and stopped after a
 *   quiet minute; one job at a time, the map before the summary, because the
 *   map is what a reader is waiting to see.
 * - **One computation per reading.** Requests are keyed as
 *   `buildReadingExports` keys its own cache (`readingExportsKey`), and the
 *   answer is kept here by that key: the workspace's summary, the map and the
 *   Documentation download all get the same object, as they did from the
 *   exporter's cache when it ran on this thread.
 * - **Never worse than before.** Where there is no worker — Node, a browser
 *   without one, a policy that blocks it, a worker that fails to load — the
 *   job runs here, on the main thread, exactly as it always did. An error the
 *   reader itself throws is not a worker failure: it is passed on, and running
 *   it again here would only freeze the page to throw the same error.
 */

/** The part of a `Worker` the client uses — so a test can hand it a fake one. */
export interface ReadingWorkerLike {
  postMessage(message: ReadingRequest): void;
  terminate(): void;
  onmessage: ((event: { data: ReadingResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
}

export interface ReadingRunnerDeps {
  /** A started worker, or null where there is none. */
  startWorker: () => Promise<ReadingWorkerLike | null>;
  /** The main-thread path: the same job, run here. */
  runInline: (job: ReadingJob) => Promise<unknown>;
  /** Stop the worker after this long without work. */
  idleMs?: number;
  /** Readings kept on this side. */
  cacheSize?: number;
}

export interface ReadingRunner {
  reading(source: string, options: ReadingOptions): Promise<ReadingResult>;
  summary(source: string, fileName: string, processName?: string): Promise<ProcessSummary | null>;
  phone(source: string, options: ReadingOptions, view: PhoneView): Promise<string | null>;
  /** Stop the worker and forget every reading (tests; a tab that is closing). */
  dispose(): void;
}

interface Pending {
  id: number;
  job: ReadingJob;
  priority: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const PRIORITY: Record<ReadingJob['kind'], number> = { reading: 0, phone: 1, summary: 2 };

export function createReadingRunner(deps: ReadingRunnerDeps): ReadingRunner {
  const idleMs = deps.idleMs ?? 60_000;
  const cacheSize = deps.cacheSize ?? 8;
  const cache = new Map<string, Promise<unknown>>();
  const queue: Pending[] = [];
  let nextId = 1;
  let inflight: Pending | null = null;
  /** `null` not started (or stopped while idle), `'broken'` never again this tab. */
  let worker: ReadingWorkerLike | null | 'broken' = null;
  let starting: Promise<ReadingWorkerLike | null> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const stopWorker = (state: null | 'broken') => {
    if (worker && worker !== 'broken') {
      const w = worker;
      w.onmessage = null;
      w.onerror = null;
      w.onmessageerror = null;
      try {
        w.terminate();
      } catch {
        /* already gone */
      }
    }
    worker = state;
  };

  const settle = (entry: Pending, response: ReadingResponse) => {
    if ('error' in response) entry.reject(new Error(response.error));
    else entry.resolve(response.result);
  };

  /** The worker failed as a worker (did not load, was blocked, died): this job and the rest run here. */
  const workerFailed = () => {
    stopWorker('broken');
    const lost = inflight;
    inflight = null;
    if (lost) queue.unshift(lost);
    void pump();
  };

  const acquire = async (): Promise<ReadingWorkerLike | null> => {
    if (worker === 'broken') return null;
    if (worker) return worker;
    if (!starting) {
      starting = deps
        .startWorker()
        .catch(() => null)
        .then((w) => {
          starting = null;
          if (!w) {
            worker = 'broken';
            return null;
          }
          w.onmessage = (event) => {
            const response = event.data;
            const entry = inflight;
            if (!entry || !response || response.id !== entry.id) return;
            inflight = null;
            settle(entry, response);
            void pump();
          };
          w.onerror = () => workerFailed();
          w.onmessageerror = () => workerFailed();
          worker = w;
          return w;
        });
    }
    return starting;
  };

  const take = (): Pending | undefined => {
    if (!queue.length) return undefined;
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].priority < queue[best].priority) best = i;
    return queue.splice(best, 1)[0];
  };

  const scheduleIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (inflight || queue.length || !worker || worker === 'broken') return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (!inflight && !queue.length && worker !== 'broken') stopWorker(null);
    }, idleMs);
  };

  let pumping = false;
  async function pump(): Promise<void> {
    if (pumping || inflight) return;
    pumping = true;
    try {
      while (!inflight && queue.length) {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        const w = await acquire();
        const entry = take();
        if (!entry) break;
        if (w && worker === w) {
          inflight = entry;
          try {
            w.postMessage({ id: entry.id, job: entry.job });
          } catch {
            // A job the worker cannot be sent is a worker that cannot be used:
            // it goes back to the front of the queue and runs here.
            workerFailed();
            continue;
          }
          break;
        }
        try {
          entry.resolve(await deps.runInline(entry.job));
        } catch (error) {
          entry.reject(error);
        }
      }
    } finally {
      pumping = false;
      scheduleIdle();
    }
  }

  const request = (key: string, job: ReadingJob): Promise<unknown> => {
    const hit = cache.get(key);
    if (hit) {
      // Most recently asked for: last out.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const promise = new Promise<unknown>((resolve, reject) => {
      queue.push({ id: nextId++, job, priority: PRIORITY[job.kind], resolve, reject });
    });
    // A failed reading is not kept: the next request may try again.
    promise.catch(() => {
      if (cache.get(key) === promise) cache.delete(key);
    });
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value as string);
    cache.set(key, promise);
    void pump();
    return promise;
  };

  return {
    reading: (source, options) =>
      request(`reading:${readingExportsKey(source, options)}`, { kind: 'reading', source, options }) as Promise<ReadingResult>,
    summary: (source, fileName, processName) =>
      request(`summary:${JSON.stringify([fileName, processName || fileName, source])}`, { kind: 'summary', source, fileName, processName }) as Promise<ProcessSummary | null>,
    phone: (source, options, view) =>
      request(
        `phone:${JSON.stringify([view.technical, Math.floor(view.fitWidth), readingExportsKey(source, options), view.readingXml])}`,
        { kind: 'phone', source, options, view },
      ) as Promise<string | null>,
    dispose: () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      stopWorker(null);
      const dropped = [...(inflight ? [inflight] : []), ...queue.splice(0)];
      inflight = null;
      for (const entry of dropped) entry.reject(new Error('The reading was stopped.'));
      cache.clear();
    },
  };
}

/* ------------------------------------------------------------ the tab's one */

async function startBrowserWorker(): Promise<ReadingWorkerLike | null> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  try {
    const { startReadingWorker } = await import('./reading-exports-worker-start');
    return startReadingWorker() as unknown as ReadingWorkerLike;
  } catch {
    return null;
  }
}

async function runHere(job: ReadingJob): Promise<unknown> {
  const { runReadingJob } = await import('./reading-exports-job');
  return runReadingJob(job);
}

let shared: ReadingRunner | null = null;
const runner = (): ReadingRunner => (shared ??= createReadingRunner({ startWorker: startBrowserWorker, runInline: runHere }));

/** `buildReadingExports`, off the main thread where the browser allows it. */
export function readingExportsOffThread(source: string, options: ReadingOptions): Promise<ReadingResult> {
  return runner().reading(source, options);
}

/** `processSummaryOf`, off the main thread where the browser allows it. */
export function processSummaryOffThread(source: string, fileName = 'source.abap', processName?: string): Promise<ProcessSummary | null> {
  return runner().summary(source, fileName, processName);
}

/** `buildPhoneReadingXml`, off the main thread where the browser allows it (owner, 12.10.2026: on a phone the CO map's narrower layout held the page for 15 s). */
export function phoneReadingXmlOffThread(source: string, options: ReadingOptions, view: PhoneView): Promise<string | null> {
  return runner().phone(source, options, view);
}
