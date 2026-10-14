/**
 * The request-attempt limit of `/api/gemini` (owner decision 13.10.2026,
 * `docs/design/gemini-attempt-limit.md`).
 *
 * The model limits that already exist — 20 calls an hour, the generation lease
 * — bound what can *succeed*. Nothing bounded how often an account may *ask*:
 * a leased call that a later gate refuses read four documents, and one valid
 * lease let an account repeat it as fast as it liked. This limiter counts
 * every attempt of a verified account before the body is read and before any
 * Firestore access, and refuses past the allowance with a 429 of its own.
 *
 * In memory, per instance, on purpose. A Firestore counter would add a read
 * and a write to every request — more than the refusals it is meant to stop.
 * Production runs at most 20 instances (`--max-instances=20` in
 * `.github/workflows/deploy.yml`), so one account gets at most 20 × the
 * allowance across the fleet; without the limiter it got no bound at all.
 *
 * What counts: every attempt the limiter admits, whatever the later gates
 * answer — a 400, a 403, a 429 of the hourly limit, a 200. An attempt the
 * limiter itself refuses is not recorded: it has cost nothing, and recording it
 * would push `Retry-After` back with every retry, so a client that waits as
 * told would be refused again.
 *
 * Memory is bounded twice: a key holds at most as many timestamps as the
 * largest allowance (an attempt past it is refused and not recorded), and the
 * map holds at most `ATTEMPT_LIMIT_MAX_KEYS` keys. Keys idle for longer than
 * the longest window are dropped as soon as anything happens; past the cap,
 * the key least recently counted is dropped.
 *
 * Pure: no imports, no Firebase, no environment. The clock is injected, so the
 * unit test (`tests/attempt-limit.spec.ts`) runs the windows without waiting.
 */

/** The `code` of the 429, so a client can tell it apart from the model limits. */
export const ATTEMPT_LIMIT_CODE = 'attempt-limit';

export interface AttemptAllowance {
  /** Attempts admitted within one window. */
  max: number;
  /** The sliding window, in milliseconds. */
  windowMs: number;
}

/**
 * 60 a minute and 300 an hour, per account and instance. The hour is about
 * 1.8 × what the existing limits let succeed (20 + 3 × 48 = 164); the minute
 * is far above four in-flight fill calls of 10–15 s each (≈ 24 a minute).
 * The one place these numbers live.
 */
export const GEMINI_ATTEMPT_ALLOWANCES: readonly AttemptAllowance[] = Object.freeze([
  Object.freeze({ max: 60, windowMs: 60 * 1000 }),
  Object.freeze({ max: 300, windowMs: 60 * 60 * 1000 }),
]);

/**
 * How many accounts one instance keeps. About 155 model calls a month across
 * the platform means a few dozen active keys; 2,000 keys of at most 300
 * timestamps each is a few megabytes at the very worst.
 */
export const ATTEMPT_LIMIT_MAX_KEYS = 2_000;

export type AttemptVerdict = { ok: true } | { ok: false; retryAfterSeconds: number };

export interface AttemptLimiter {
  /** Count one attempt for `key` at the current time, or refuse it. */
  attempt(key: string): AttemptVerdict;
  /** How many keys are held (for the tests). */
  size(): number;
  /**
   * Forget every key. For the measurement harness
   * (`scripts/measure-gemini-refusals.ts`), which times each refused path
   * hundreds of times from one account and must reach the path, not this limit.
   */
  clear(): void;
}

export function createAttemptLimiter(
  options: {
    allowances?: readonly AttemptAllowance[];
    maxKeys?: number;
    now?: () => number;
  } = {},
): AttemptLimiter {
  const allowances = options.allowances ?? GEMINI_ATTEMPT_ALLOWANCES;
  const maxKeys = options.maxKeys ?? ATTEMPT_LIMIT_MAX_KEYS;
  const now = options.now ?? Date.now;
  if (allowances.length === 0) throw new Error('An attempt limiter needs at least one allowance.');
  for (const a of allowances) {
    if (!(Number.isInteger(a.max) && a.max > 0 && a.windowMs > 0)) throw new Error('An allowance needs a positive max and window.');
  }
  if (!(Number.isInteger(maxKeys) && maxKeys > 0)) throw new Error('An attempt limiter needs a positive key cap.');

  const longestMs = Math.max(...allowances.map((a) => a.windowMs));
  const largestMax = Math.max(...allowances.map((a) => a.max));

  // Ascending timestamps of the counted attempts within the longest window.
  // The map's order is the order in which keys were last counted: a key is
  // deleted and set again on every counted attempt, so the first key is always
  // the least recently counted one.
  const entries = new Map<string, number[]>();

  /** Drop the keys at the front whose last counted attempt is out of every window. */
  function sweepIdle(at: number): void {
    for (const [key, stamps] of entries) {
      if (stamps.length > 0 && stamps[stamps.length - 1] > at - longestMs) return;
      entries.delete(key);
    }
  }

  return {
    attempt(key: string): AttemptVerdict {
      const at = now();
      sweepIdle(at);

      let stamps = entries.get(key);
      if (stamps) {
        // Prune this key's own expired attempts.
        let drop = 0;
        while (drop < stamps.length && stamps[drop] <= at - longestMs) drop++;
        if (drop > 0) stamps = stamps.slice(drop);
      } else {
        stamps = [];
      }

      // Refused when any window already holds its allowance. The wait is until
      // enough of the oldest attempts in that window have left it.
      let retryAfterMs = 0;
      for (const { max, windowMs } of allowances) {
        let inWindow = 0;
        for (let i = stamps.length - 1; i >= 0 && stamps[i] > at - windowMs; i--) inWindow++;
        if (inWindow >= max) {
          const oldestThatMustLeave = stamps[stamps.length - max];
          retryAfterMs = Math.max(retryAfterMs, oldestThatMustLeave + windowMs - at);
        }
      }
      if (retryAfterMs > 0) {
        // Refused and not recorded; the pruned list is kept in its place.
        if (stamps.length > 0) entries.set(key, stamps);
        else entries.delete(key);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }

      stamps.push(at);
      // Never more than the largest allowance: anything older cannot decide a refusal.
      if (stamps.length > largestMax) stamps = stamps.slice(stamps.length - largestMax);
      entries.delete(key);
      if (entries.size >= maxKeys) {
        // Full of keys that are all still in a window: the least recently counted goes.
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      entries.set(key, stamps);
      return { ok: true };
    },
    size(): number {
      return entries.size;
    },
    clear(): void {
      entries.clear();
    },
  };
}

/** The limiter `/api/gemini` counts with: one per server instance. */
export const geminiAttemptLimiter: AttemptLimiter = createAttemptLimiter();

/** The 429's sentence. */
export function attemptLimitMessage(retryAfterSeconds: number): string {
  return `Too many requests from this account (${ATTEMPT_LIMIT_CODE}). Nothing was sent to the model. Please try again in ${retryAfterSeconds} seconds.`;
}
