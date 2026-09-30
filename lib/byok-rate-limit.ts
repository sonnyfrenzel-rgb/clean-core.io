import { assertRateLimit } from '@/lib/rate-limit';

/**
 * How often one account may save, remove or test its own model key.
 *
 * Roadmap 3.0.13, owner decision of 30.09.2026: the limit is per ACCOUNT. The
 * save and delete routes keyed it on the account *and* the client address,
 * which gave the same account a fresh allowance from every address it could
 * reach us through — the defect `app/api/gemini/route.ts` already records, and
 * the one 3.0.13 (d) closed for the key test. The account is established by the
 * verified ID token; it is the thing limited, and nothing the caller sends can
 * move it into another window.
 *
 * That is why `assertByokRateLimit` takes the account and nothing else: there is
 * no request parameter through which an address, a header or a body field could
 * become part of the key again.
 *
 * The numbers are the ones the routes already used: ten saves and ten removals
 * an hour (a person rotating a key needs one of each), five tests every fifteen
 * minutes (the key test is what bounds using the server as a key oracle).
 */

export type ByokRateLimitedAction = 'save' | 'delete' | 'test';

interface ByokLimit {
  readonly max: number;
  readonly windowMs: number;
  /** What the account tried to do, for the 429 — "save", "remove", "test". */
  readonly verb: string;
  /** The window in words, for the 429. */
  readonly per: string;
  /** What did not happen, for the 429. */
  readonly outcome: string;
}

export const BYOK_RATE_LIMITS: Readonly<Record<ByokRateLimitedAction, ByokLimit>> = {
  save: { max: 10, windowMs: 3_600_000, verb: 'save', per: 'per hour', outcome: 'Nothing was saved.' },
  delete: { max: 10, windowMs: 3_600_000, verb: 'remove', per: 'per hour', outcome: 'Your stored key was not removed.' },
  test: { max: 5, windowMs: 900_000, verb: 'test', per: 'every 15 minutes', outcome: 'The key was not tested.' },
};

/**
 * The limiter key. `byok_test:<uid>` is the key the test route has used since
 * 3.0.13 (d), so its running windows carry over; save and delete drop the
 * `:<address>` suffix they had.
 */
export function byokRateLimitKey(action: ByokRateLimitedAction, uid: string): string {
  return `byok_${action}:${uid}`;
}

/** The 429 text: what was refused, the limit, that it is this account's, and when to retry. */
export function byokRateLimitMessage(action: ByokRateLimitedAction, retryAfterSeconds: number): string {
  const { max, verb, per, outcome } = BYOK_RATE_LIMITS[action];
  return (
    `Too many attempts to ${verb} an API key: this account may do that at most ${max} times ${per}. ` +
    `${outcome} Please try again in ${retryAfterSeconds} seconds.`
  );
}

/** Throws a `QuotaError` with status 429 once the account has used up its window for this action. */
export async function assertByokRateLimit(action: ByokRateLimitedAction, uid: string): Promise<void> {
  const { max, windowMs } = BYOK_RATE_LIMITS[action];
  await assertRateLimit(byokRateLimitKey(action, uid), max, windowMs, (retryAfterSeconds) =>
    byokRateLimitMessage(action, retryAfterSeconds),
  );
}
