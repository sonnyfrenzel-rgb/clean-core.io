/**
 * Who the free-run quota actually stops — one rule, read by the screens.
 *
 * The server decides this in `reserveRunQuota` (`lib/firebase-admin.ts`): an
 * enterprise account is never charged, an account with its own Gemini key is
 * never charged, the same source twice is never charged, a shipped starter
 * example is never charged the first time an account runs it, and only what
 * remains is counted against the five free runs. The dashboard had its own copy
 * of a third of that rule — `transformationsUsed >= transformationsLimit` and
 * nothing else — in front of project creation, so the very users the same
 * screen told to add their own key were the ones it stopped.
 *
 * This module is the client's half, deliberately pure and deliberately narrow:
 * it says whether the quota is exhausted for an account, never whether a
 * particular run will be charged — the input fingerprint that decides the
 * re-analysis case lives on the server and only the server may act on it.
 * Nothing here grants anything: the metering point stays `/api/runs/create`.
 * The starter-example answer below is the same kind of reading — it is what the
 * screen has to say before the click (roadmap 0.9: nothing spends quota without
 * saying so first), and the server re-decides it from the source text.
 */
export interface QuotaSubject {
  tier?: string | null;
  byokConfigured?: boolean | null;
  /**
   * When the stored own key last passed its test (server time, written by the
   * Admin SDK only). Roadmap 3.0.21: an own key counts as configured — lifts
   * the quota, may run automatic steps, counts as "own key" anywhere else —
   * only once it passed a test.
   */
  byokTestedAt?: unknown;
  transformationsUsed?: number | null;
  transformationsLimit?: number | null;
  /**
   * Which shipped examples this account has already had for free, keyed by the
   * example's object name. Written only by the Admin SDK (`reserveRunQuota`).
   */
  starterExamplesUsed?: Record<string, boolean> | null;
}

export const COMMUNITY_QUOTA_FALLBACK = 5;

/**
 * The account's own key counts: stored **and** tested successfully (roadmap
 * 3.0.21). A key saved before the rule, or one whose last test failed, carries
 * no `byokTestedAt` and does not count until a test passes. The one rule —
 * `reserveRunQuota`, the automatic-steps switch and the screens read it.
 */
export function ownKeyCounts(profile: Pick<QuotaSubject, 'byokConfigured' | 'byokTestedAt'> | null | undefined): boolean {
  if (!profile) return false;
  return profile.byokConfigured === true && profile.byokTestedAt !== undefined && profile.byokTestedAt !== null;
}

/** The account pays for its own runs — the community quota does not apply. */
export function runsAreSelfFunded(profile: QuotaSubject | null | undefined): boolean {
  if (!profile) return false;
  return profile.tier === 'enterprise' || ownKeyCounts(profile);
}

/**
 * True when a new analysis would be refused for want of quota. False for a
 * self-funded account, and false while runs remain.
 */
export function quotaExhausted(profile: QuotaSubject | null | undefined): boolean {
  if (!profile) return false;
  if (runsAreSelfFunded(profile)) return false;
  const used = typeof profile.transformationsUsed === 'number' ? profile.transformationsUsed : 0;
  const limit = typeof profile.transformationsLimit === 'number' ? profile.transformationsLimit : COMMUNITY_QUOTA_FALLBACK;
  return used >= limit;
}

/**
 * True while this account still has its one free run of that shipped example
 * (roadmap 0.9). False once it has been had — the next start of the same example
 * is an ordinary analysis and the screen has to say so before the click.
 *
 * Unchanged examples only: the server recognises them by the fingerprint of the
 * source text, so an edited one is the visitor's own code and is charged whatever
 * this answers.
 */
export function starterExampleIsFree(
  profile: QuotaSubject | null | undefined,
  exampleName: string,
): boolean {
  if (!exampleName) return false;
  if (runsAreSelfFunded(profile)) return true;
  return profile?.starterExamplesUsed?.[exampleName] !== true;
}

/** What is left of the free runs — for display only, and never negative. */
export function runsRemaining(profile: QuotaSubject | null | undefined): number {
  if (!profile) return 0;
  const used = typeof profile.transformationsUsed === 'number' ? profile.transformationsUsed : 0;
  const limit = typeof profile.transformationsLimit === 'number' ? profile.transformationsLimit : COMMUNITY_QUOTA_FALLBACK;
  return Math.max(0, limit - used);
}
