import { handleScaffoldRequest, type ScaffoldRequest, type ScaffoldResponse } from './scaffold-job';

/**
 * The scaffold worker: the engine-led generation's plan and scaffold off the
 * page's thread (roadmap 3.0.12, step E). Bundled by webpack as a same-origin
 * chunk (`new Worker(new URL(…))` in `scaffold-worker-start.ts`); started and
 * fed only by `scaffold-client.ts`.
 *
 * The scope is typed by hand: the project compiles against the DOM library,
 * and adding the webworker library beside it collides.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScaffoldRequest>) => void) | null;
  postMessage: (message: ScaffoldResponse) => void;
};

scope.onmessage = (event) => {
  scope.postMessage(handleScaffoldRequest(event.data));
};
