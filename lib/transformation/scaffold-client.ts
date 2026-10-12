import type { EngineLedPreparation, EngineLedRequest } from './engine-led';
import type { ScaffoldResponse } from './scaffold-job';

/**
 * The page's side of the scaffold worker (roadmap 3.0.12, step E).
 *
 * One worker per generation: started when the generation starts, terminated
 * when it has answered or the generation was cancelled. Where there is no
 * worker — a browser without one, a policy that blocks it, a chunk that fails
 * to load — the same job runs here, on the main thread (`scaffold-job.ts`),
 * so a generation never fails for the want of a worker.
 *
 * A performance mark (`cc-scaffold-worker`) is left when the job is posted to
 * the worker: the cheap, observable proof that it left the page's thread.
 */
export async function prepareScaffold(request: EngineLedRequest, signal?: AbortSignal): Promise<EngineLedPreparation> {
  const inline = async (): Promise<EngineLedPreparation> => {
    const { handleScaffoldRequest } = await import('./scaffold-job');
    return handleScaffoldRequest({ id: 0, request }).preparation;
  };
  let worker: Worker | null = null;
  try {
    if (typeof Worker === 'undefined') return await inline();
    const { startScaffoldWorker } = await import('./scaffold-worker-start');
    worker = startScaffoldWorker();
  } catch {
    return inline();
  }
  const w = worker;
  return new Promise<EngineLedPreparation>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      w.terminate();
      fn();
    };
    const onAbort = () => done(() => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    w.onmessage = (event: MessageEvent<ScaffoldResponse>) => done(() => resolve(event.data.preparation));
    // A worker that cannot load or run: the same job here.
    const fallback = () => done(() => void inline().then(resolve, reject));
    w.onerror = fallback;
    w.onmessageerror = fallback;
    try {
      performance.mark('cc-scaffold-worker');
    } catch {
      /* no user timing */
    }
    w.postMessage({ id: 1, request });
  });
}
