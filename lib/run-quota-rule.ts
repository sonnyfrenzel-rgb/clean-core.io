/**
 * Who the free-run quota actually stops — one rule, read by the screens.
 *
 * The server decides this in `reserveRunQuota` (`lib/firebase-admin.ts`): an
 * enterprise account is never charged, an account with its own Gemini key is
 * never charged, the same source twice is never charged, and only what remains
 * is counted against the five free runs. The dashboard had its own copy of a
 * third of that rule — `transformationsUsed >= transformationsLimit` and
 * nothing else — in front of project creation, so the very users the same
 * screen told to add their own key were the ones it stopped (QA review of
 * 33471220d6e9, 9b1af76b65c9).
 *
 * This module is the client's half, deliberately pure and deliberately narrow:
 * it says whether the quota is exhausted for an account, never whether a
 * particular run will be charged — the input fingerprint that decides the
 * re-analysis case lives on the server and only the server may act on it.
 * Nothing here grants anything: the metering point stays `/api/runs/create`.
 */
export interface QuotaSubject {
  tier?: string | null;
  byokConfigured?: boolean | null;
  transformationsUsed?: number | null;
  transformationsLimit?: number | null;
}

export const COMMUNITY_QUOTA_FALLBACK = 5;

/** The account pays for its own runs — the community quota does not apply. */
export function runsAreSelfFunded(profile: QuotaSubject | null | undefined): boolean {
  if (!profile) return false;
  return profile.tier === 'enterprise' || profile.byokConfigured === true;
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

/** What is left of the free runs — for display only, and never negative. */
export function runsRemaining(profile: QuotaSubject | null | undefined): number {
  if (!profile) return 0;
  const used = typeof profile.transformationsUsed === 'number' ? profile.transformationsUsed : 0;
  const limit = typeof profile.transformationsLimit === 'number' ? profile.transformationsLimit : COMMUNITY_QUOTA_FALLBACK;
  return Math.max(0, limit - used);
}
