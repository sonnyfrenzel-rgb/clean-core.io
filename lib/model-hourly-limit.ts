/**
 * The hourly model-call limit of an account (roadmap 3.0.13).
 *
 * Every account has one, administrators included. A normal account may make
 * `MODEL_CALLS_PER_HOUR` model calls an hour through `/api/gemini` — the
 * primary cost guard on the shared community key. An account with the admin
 * claim has an hourly model-call limit of its own, `ADMIN_MODEL_CALLS_PER_HOUR`,
 * counted by the same Firestore-backed window (`assertRateLimit` in
 * `lib/rate-limit.ts`) in a separate bucket, so an administrator's calls never
 * spend a normal account's allowance and the two ceilings stay independent.
 *
 * The in-memory attempt limiter (`lib/attempt-limit.ts`) still counts every
 * attempt on top of this; it is per instance and does not replace this limit.
 *
 * A generation lease (`/api/transformation/lease`) costs one unit of the same
 * bucket when it is issued, and the calls made under it are counted against
 * the lease instead — for administrators exactly as for everyone else.
 *
 * Both routes pick the bucket here and make one `assertRateLimit` call with it.
 */
import { DEV_MODEL_CALLS_PER_HOUR, devLimitsLifted } from './dev-limits';

/** Model calls a normal account may make per hour. */
export const MODEL_CALLS_PER_HOUR = 20;

/** Model calls an account with the admin claim may make per hour (owner decision 13.10.2026). */
export const ADMIN_MODEL_CALLS_PER_HOUR = 200;

/** The window both limits are counted in. */
export const MODEL_HOURLY_WINDOW_MS = 60 * 60 * 1000;

export interface ModelHourlyLimit {
  /** The rate-limit key: the bucket and the account, nothing the caller sends. */
  readonly key: string;
  /** How many calls the window admits. */
  readonly max: number;
}

/**
 * The bucket an account's model calls are counted in. `isAdmin` must come from
 * the verified token's claim (`decodedToken.admin === true`), never from the
 * request or the profile mirror.
 */
export function modelHourlyLimit(uid: string, isAdmin: boolean): ModelHourlyLimit {
  // The dev service only (`lib/dev-limits.ts`): the same buckets, a higher ceiling.
  const lifted = devLimitsLifted();
  return isAdmin
    ? { key: `gemini-admin:${uid}`, max: lifted ? DEV_MODEL_CALLS_PER_HOUR : ADMIN_MODEL_CALLS_PER_HOUR }
    : { key: `gemini:${uid}`, max: lifted ? DEV_MODEL_CALLS_PER_HOUR : MODEL_CALLS_PER_HOUR };
}
