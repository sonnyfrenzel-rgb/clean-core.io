/**
 * The owner's switch for lifting the hourly limits on the dev service only (owner request 18.10.2026: "schalte mir
 * auf dev die limits frei, nur auf dev"). Test walk-throughs of the acceptance set need more than three code
 * generations an hour; the community limits stay what they are everywhere else.
 *
 * Three conditions, all read from the server's environment, and all must hold:
 *   - `CC_DEV_LIMITS_OFF=true` — set by `.github/workflows/deploy.yml` for the `dev` branch only;
 *   - `K_SERVICE` is set and is not `clean-core` — Cloud Run names the service, so the production service ignores
 *     the switch even if the variable reached it by mistake;
 *   - the Firestore database is not production's `clean-core-eu`.
 * In a browser bundle none of these exist, so a client reading of a limit always shows the community value.
 *
 * What it lifts: the hourly generation leases (`lib/transformation/lease.ts`) and the hourly model-call limit
 * (`lib/model-hourly-limit.ts`). Nothing else — the run quota, the in-memory attempt limiter, the lease budget
 * of one generation and every check of the trust chain stay as they are.
 */

type Env = Readonly<Record<string, string | undefined>>;

const PRODUCTION_SERVICE = 'clean-core';
const PRODUCTION_DB = 'clean-core-eu';

/** Generation leases an hour while the switch holds. */
export const DEV_LEASES_PER_WINDOW = 100;
/** Model calls an hour while the switch holds. */
export const DEV_MODEL_CALLS_PER_HOUR = 2000;

export function devLimitsLifted(env: Env = typeof process !== 'undefined' ? process.env : {}): boolean {
  if (env.CC_DEV_LIMITS_OFF !== 'true') return false;
  if (!env.K_SERVICE || env.K_SERVICE === PRODUCTION_SERVICE) return false;
  if (env.NEXT_PUBLIC_FIRESTORE_DB_ID === PRODUCTION_DB) return false;
  return true;
}
