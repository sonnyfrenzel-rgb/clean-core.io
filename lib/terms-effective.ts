import { TERMS_EFFECTIVE_DATE_ISO } from '@/lib/legal/open-values';

/**
 * When an accepted amendment of the Terms takes effect — Terms 10.2 and the
 * dialog C2 of Fassung 1.1 (G13/G14, 3.0.21).
 *
 * The dialog may ask as soon as the amendment is announced (10.1), six weeks
 * ahead of the day it is meant to take effect. An early "yes" must not bring
 * that day forward: the amendment takes effect for the account on the
 * announced day, and until then the version it accepted before keeps
 * applying. So a record of an amendment holds two times — when it was accepted
 * and when it takes effect — and the version in effect for an account is read
 * from both.
 *
 * The announced day is the open value `termsEffectiveDate`
 * (`TERMS_EFFECTIVE_DATE_ISO`), set on the release day with the announcement
 * mail. While it is not set there is no later day to wait for, and an
 * acceptance takes effect when it is given; the release gate keeps the texts
 * from going live without it.
 *
 * Pure, no imports beyond the constant, so the gate component and the routes
 * share it.
 */

export type ConsentOccasion = 'sign-up' | 'amendment';

/**
 * 00:00 in Germany (Europe/Berlin) on an ISO date: "zum 1. Dezember" begins at
 * midnight where the operator and the law of the contract are, not in UTC.
 */
export function berlinMidnight(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  const utcMidnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // The offset Berlin has at that moment (+01:00 in winter, +02:00 in summer).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMidnight));
  const berlinHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return new Date(utcMidnight - berlinHour * 60 * 60 * 1000);
}

/** The announced effective day as a moment, or null while it is not set. */
export function announcedEffectiveDate(iso: string | null = TERMS_EFFECTIVE_DATE_ISO): Date | null {
  return iso ? berlinMidnight(iso) : null;
}

/**
 * When an acceptance given at `acceptedAt` takes effect. A sign-up concludes a
 * new contract on the version offered (10.1, last sentence) and takes effect at
 * once; an amendment accepted before the announced day takes effect on it.
 */
export function acceptanceEffectiveAt(
  occasion: ConsentOccasion,
  acceptedAt: Date,
  iso: string | null = TERMS_EFFECTIVE_DATE_ISO,
): Date {
  if (occasion !== 'amendment') return acceptedAt;
  const announced = announcedEffectiveDate(iso);
  return announced && announced.getTime() > acceptedAt.getTime() ? announced : acceptedAt;
}

/** Whether the announced day still lies ahead — the dialog then names it as the day the change will take effect. */
export function effectiveDateAhead(now: Date = new Date(), iso: string | null = TERMS_EFFECTIVE_DATE_ISO): boolean {
  const announced = announcedEffectiveDate(iso);
  return !!announced && announced.getTime() > now.getTime();
}

/** The profile fields the version in effect is read from (written by `recordConsent`). */
export interface TermsAcceptanceState {
  termsVersionAccepted?: unknown;
  termsVersionPrevious?: unknown;
  termsEffectiveAt?: unknown;
}

function asMillis(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' || typeof v === 'number') {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const ts = v as { toMillis?: () => number; toDate?: () => Date } | null;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
  return null;
}

/**
 * The version of the Terms in effect for an account at `now`: the version it
 * accepted, except while an amendment it accepted early has not reached its
 * effective date — then the version it accepted before. Null when the account
 * accepted nothing.
 */
export function termsVersionInEffectFor(state: TermsAcceptanceState | null | undefined, now: Date = new Date()): string | null {
  const accepted = typeof state?.termsVersionAccepted === 'string' && state.termsVersionAccepted ? state.termsVersionAccepted : null;
  if (!accepted) return null;
  const effectiveAt = asMillis(state?.termsEffectiveAt);
  const previous = typeof state?.termsVersionPrevious === 'string' && state.termsVersionPrevious ? state.termsVersionPrevious : null;
  if (effectiveAt !== null && effectiveAt > now.getTime() && previous) return previous;
  return accepted;
}
