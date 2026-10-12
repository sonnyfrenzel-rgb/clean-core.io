/**
 * Starts the reading worker. Its own module because `import.meta.url` is
 * webpack's cue to bundle the worker as a same-origin chunk, and a module
 * holding it cannot be loaded by the Node test runner — the client imports this
 * only in a browser, on the first request.
 */
export function startReadingWorker(): Worker {
  return new Worker(new URL('./reading-exports.worker.ts', import.meta.url));
}
