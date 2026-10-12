import { handleReadingRequest, type ReadingRequest, type ReadingResponse } from './reading-exports-job';

/**
 * The reading worker: `buildReadingExports` and the process summary off the
 * page's thread (owner, 12.10.2026: the CO project froze the Documentation
 * tool). Bundled by webpack as a same-origin chunk (`new Worker(new URL(…))`
 * in `reading-exports-worker-start.ts`); started and fed only by
 * `reading-exports-client.ts`.
 *
 * The scope is typed by hand: the project compiles against the DOM library,
 * and adding the webworker library beside it collides.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ReadingRequest>) => void) | null;
  postMessage: (message: ReadingResponse) => void;
};

scope.onmessage = (event) => {
  scope.postMessage(handleReadingRequest(event.data));
};
