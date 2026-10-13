/**
 * How long one `/api/gemini` request may wait for the model, and the signal
 * that ends it.
 *
 * Cloud Run ends every request of the app service at 300 seconds (the
 * platform default; `.github/workflows/deploy.yml` sets no `--timeout` for
 * `clean-core`). The route itself had no bound: the provider call carried no
 * timeout, and `callWithRetry` asks again up to three times after a 429 or a
 * 503 with 2 s, 4 s and 8 s between — so one request could run for 4 × the
 * provider's own wait plus 14 s. On 13.10.2026 an engine-led Transformation
 * of a 1,848-line program made 25 fill calls whose latencies ran from 9 s to
 * 292 s (median 165 s); one reached 300 s and Cloud Run answered 504 with no
 * body. The route never learnt it: its provider call was aborted by the
 * request going away, it logged an AbortError five minutes later, and the
 * browser read "Unknown error".
 *
 * So the route now stops waiting `MODEL_CALL_DEADLINE_MS` after the request
 * arrived — the whole exchange, retries and backoff included — and answers itself, with a code,
 * while Cloud Run still holds the request: 30 seconds before its limit, which
 * leaves room for the gates before the call (auth, MFA, account, profile,
 * lease transaction) and the receipt after it. A call the deadline ends is
 * aborted at the provider, so nothing keeps running for nobody.
 *
 * Pure: no Next, no SDK.
 */

/** The app service's request limit on Cloud Run (the platform default; deploy.yml sets none). */
export const CLOUD_RUN_REQUEST_TIMEOUT_MS = 300_000;

/** The longest one `/api/gemini` request runs, counted from its arrival, before it answers itself — retries and backoff included. */
export const MODEL_CALL_DEADLINE_MS = 270_000;

/** The code of the route's answer when the deadline ended the call. */
export const MODEL_TIMEOUT_CODE = 'model-timeout';

export function modelTimeoutMessage(ms: number = MODEL_CALL_DEADLINE_MS): string {
  return `The model did not answer within ${Math.round(ms / 1000)} seconds, so the call was stopped. Nothing from it was used — try again.`;
}

export interface ModelDeadline {
  /** Aborts when the deadline passes or when `outer` aborts, whichever comes first. */
  signal: AbortSignal;
  /** True when it was the deadline, not `outer`, that ended the call. */
  timedOut: () => boolean;
  /** Stops the timer; call it when the call is over. */
  clear: () => void;
}

/**
 * A signal that aborts after `ms`, or with `outer` (a leased call's request
 * signal) — whichever comes first.
 */
export function modelDeadline(
  ms: number = MODEL_CALL_DEADLINE_MS,
  outer?: AbortSignal,
): ModelDeadline {
  const controller = new AbortController();
  let expired = false;
  const onOuter = () => controller.abort(outer?.reason);
  const timer = setTimeout(() => {
    expired = true;
    controller.abort(new DOMException(modelTimeoutMessage(), 'TimeoutError'));
  }, ms);
  if (outer) {
    if (outer.aborted) onOuter();
    else outer.addEventListener('abort', onOuter, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => expired,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
  };
}
