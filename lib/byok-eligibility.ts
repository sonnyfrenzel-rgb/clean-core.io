/**
 * Who may bring their own model key — one list, read by the browser and the server.
 *
 * Roadmap 3.0.13 (c). The rule used to live in one place only: the settings
 * screen (`isPilotTier`), which decides whether the "Bring Your Own Key" card
 * is shown. The routes behind the card — save and test in
 * `app/api/secrets/gemini/*` — checked the token, the second factor, the
 * account state and a rate limit, but not the tier, so the rule was a matter
 * of which buttons a page drew. It holds on the server now, from the same
 * function the page calls, so the two cannot drift.
 *
 * **The list is today's list, unchanged**: an administrator, or an account on
 * one of the four tiers below. Every account that activates itself is written
 * `tier: 'pilot'` (`lib/firebase-admin.ts`, `activateAccount`), so in practice
 * every active account qualifies — as before. Who should be allowed BYOK is
 * Sonny's decision (roadmap 3.5); when it is taken, it is taken here and
 * nowhere else.
 *
 * Withdrawing a key is **not** gated by this: `DELETE /api/secrets/gemini`
 * stays open to every signed-in account, because taking your own key off the
 * server must never depend on the plan the account is on today.
 *
 * Pure: no imports, so the browser bundle can use it.
 */

/** The tiers that may store and test their own key. */
export const BYOK_TIERS: readonly string[] = ['pilot', 'pilot_byok', 'starter', 'unlimited'];

/** The code a refusal carries, so a screen can branch on it rather than on a sentence. */
export const BYOK_NOT_AVAILABLE_CODE = 'byok-not-available';

export const BYOK_NOT_AVAILABLE_MESSAGE =
  `Bringing your own key is not available for this account (${BYOK_NOT_AVAILABLE_CODE}).`;

/**
 * `isAdmin` is whatever admin signal the caller trusts: the verified `admin`
 * claim on the server, the profile's display mirror in the browser (which
 * only decides what is drawn — the server asks the claim).
 */
export function byokAllowed(account: { isAdmin?: boolean | null; tier?: unknown } | null | undefined): boolean {
  if (!account) return false;
  if (account.isAdmin === true) return true;
  return typeof account.tier === 'string' && BYOK_TIERS.includes(account.tier);
}
