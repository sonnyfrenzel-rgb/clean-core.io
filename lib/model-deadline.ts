/**
 * How long one `/api/gemini` request may wait for the model, and the signal
 * that ends it.
 *
 * Cloud Run ended every request of the app service at 300 seconds (the
 * platform default) until 13.10.2026; since then deploy.yml sets
 * `--timeout=900` for the app service. The route itself had no bound: the provider call carried no
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

/**
 * The app service's request limit on Cloud Run: `--timeout=900` in deploy.yml
 * (owner decision 13.10.2026 — a fill call took up to 292 s against the 300 s
 * default). `tests/model-deadline.spec.ts` fails when the two disagree.
 */
export const CLOUD_RUN_REQUEST_TIMEOUT_MS = 900_000;

/** The longest one `/api/gemini` request runs, counted from its arrival, before it answers itself — retries and backoff included. */
export const MODEL_CALL_DEADLINE_MS = 870_000;

/** The code of the route's answer when the deadline ended the call. */
export const MODEL_TIMEOUT_CODE = 'model-timeout';

export function modelTimeoutMessage(ms: number = MODEL_CALL_DEADLINE_MS): string {
  return `The model did not answer within ${Math.round(ms / 1000)} seconds, so the call was stopped. Nothing from it was used — try again.`;
}

/** The code of the route's answer when the connection to the provider failed or timed out (hotfix 3.0.22, HF-c). */
export const MODEL_NETWORK_CODE = 'model-network';

/** Codes and names of the thrown value and its causes, outermost first: `fetch failed` → `UND_ERR_HEADERS_TIMEOUT`. */
export function errorCodes(error: unknown): string[] {
  const out: string[] = [];
  let e: unknown = error;
  for (let depth = 0; e && typeof e === 'object' && depth < 4; depth++) {
    const x = e as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof x.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(x.code)) out.push(x.code);
    if (typeof x.name === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(x.name)) out.push(x.name);
    e = x.cause;
  }
  return out;
}

const TIMEOUT_CODES = /^(?:UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|HeadersTimeoutError|BodyTimeoutError|ConnectTimeoutError|TimeoutError)$/;
const NETWORK_CODES = /^(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EPIPE|ENETUNREACH|EHOSTUNREACH|UND_ERR_SOCKET|UND_ERR_CLOSED|SocketError)$/;

/**
 * What a failed provider call was, in words a user can act on (hotfix 3.0.22, HF-c). Owner example A's second Testing
 * attempt ended after 304 s with "Network error … This may be due to regional restrictions": every error whose message
 * held "fetch" got that sentence, though the call had waited for the answer and given up. Null when the error is not a
 * connection failure (`fetch failed`, or one of the codes above, on it or its causes): the route then answers as
 * before. Codes only — never the error's text, which can carry the prompt.
 */
export function providerConnectionFailure(error: unknown, elapsedMs?: number): { kind: 'timeout' | 'network'; code: string | null; message: string } | null {
  const codes = errorCodes(error);
  const text = error instanceof Error ? error.message : '';
  const after = typeof elapsedMs === 'number' && elapsedMs >= 1000 ? ` after ${Math.round(elapsedMs / 1000)} seconds` : '';
  const timeout = codes.find((c) => TIMEOUT_CODES.test(c));
  if (timeout) {
    return {
      kind: 'timeout',
      code: timeout,
      message: `The connection to the model provider timed out${after} while waiting for its answer (${timeout}), so the call was stopped. Nothing from it was used — try again.`,
    };
  }
  const network = codes.find((c) => NETWORK_CODES.test(c));
  if (network || /\bfetch\b/i.test(text)) {
    return {
      kind: 'network',
      code: network ?? null,
      message: `The connection to the model provider failed${after}${network ? ` (${network})` : ''}: no answer was received. Nothing from it was used — try again.`,
    };
  }
  return null;
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
