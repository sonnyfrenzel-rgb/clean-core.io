/**
 * Whether a verified ID token says its holder signed in within the last
 * `maxAgeSeconds`.
 *
 * Fails closed: a token without a numeric `auth_time` is not a recent login.
 * Subtracting `undefined` gives NaN, and `NaN > 300` is false, so a check
 * written as "refuse when too old" let a token without the claim through.
 * Asked the other way round — "allow only when provably recent" — the missing
 * claim refuses.
 *
 * Pure and import-free, so the routes and the tests read the same rule.
 */
export function isRecentLogin(
  decodedToken: { auth_time?: unknown } | null | undefined,
  maxAgeSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const authTime = decodedToken?.auth_time;
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return false;
  // A sign-in time in the future is not evidence of anything recent.
  if (authTime - nowSeconds > 60) return false;
  return nowSeconds - authTime <= maxAgeSeconds;
}
