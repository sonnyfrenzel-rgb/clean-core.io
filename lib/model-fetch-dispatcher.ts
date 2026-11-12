import { Agent, setGlobalDispatcher } from 'undici';
import { CLOUD_RUN_REQUEST_TIMEOUT_MS } from './model-deadline';

/**
 * The connection limits of every server-side `fetch` (hotfix 3.0.22, HF-c).
 *
 * Owner example A, 06.11.2026: a Testing call ended after 304 s with a network
 * error although the route allows a model call 870 s (`MODEL_CALL_DEADLINE_MS`).
 * The provider SDKs call Node's built-in `fetch`, whose undici agent gives up
 * when no response header arrives within 300 s (`headersTimeout`) or a body
 * pauses for 300 s (`bodyTimeout`) — a model that thinks for five minutes
 * before its first byte is cut off by the transport, not by our deadline.
 *
 * Both limits are raised to Cloud Run's request limit, so the route's own
 * deadline (870 s, an abort signal on every call) is what ends a slow call,
 * with its own code and message. Verified 12.11.2026 on Node 22.23 and 24.20:
 * the built-in `fetch` uses the dispatcher set here (1 s → headers timeout,
 * 10 s → the answer after 3 s, against a server that answers after 3 s).
 */
export const MODEL_FETCH_TIMEOUTS_MS = {
  headersTimeout: CLOUD_RUN_REQUEST_TIMEOUT_MS,
  bodyTimeout: CLOUD_RUN_REQUEST_TIMEOUT_MS,
} as const;

/** Sets the process-wide dispatcher Node's `fetch` uses. Called once from `instrumentation.ts`. */
export function installModelFetchDispatcher(
  timeouts: { headersTimeout: number; bodyTimeout: number } = MODEL_FETCH_TIMEOUTS_MS,
): void {
  setGlobalDispatcher(new Agent(timeouts));
}
