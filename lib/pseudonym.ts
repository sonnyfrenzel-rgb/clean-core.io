import { createHmac } from 'crypto';

/**
 * The keyed hash that stands for an address wherever a record outlives what it
 * names — the proof log after an erasure, the delivery records, the opt-out
 * list (privacy policy sections 2, 5 and 6: "a keyed hash of your address
 * (HMAC with a secret pepper)"). `lib/proof-log.ts` explains the records.
 *
 * Only `crypto`, so the send scripts (`scripts/send-survey.ts`) compute the same
 * value as the routes.
 */

/** The secret pepper of every keyed hash of an address. Never logged, never stored. */
export const PSEUDONYM_PEPPER_ENV = 'PSEUDONYM_PEPPER';

export class PseudonymPepperMissingError extends Error {
  readonly code = 'pseudonym-pepper-missing';
  constructor() {
    super(`${PSEUDONYM_PEPPER_ENV} is not set (at least 32 characters) — no keyed hash of an address can be made.`);
    this.name = 'PseudonymPepperMissingError';
  }
}

export function pseudonymPepperConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const p = env[PSEUDONYM_PEPPER_ENV];
  return typeof p === 'string' && p.length >= 32;
}

/** The normalised address a hash is taken over (the same rule as the unsubscribe list). */
export function normaliseAddress(email: string): string {
  return (email || '').trim().toLowerCase();
}

/**
 * HMAC-SHA256 under `PSEUDONYM_PEPPER` of the normalised address, prefixed so a
 * reader can tell it from a plain digest. Without the pepper nobody can
 * recompute it from an address list; with it, the operator can answer "did this
 * address accept version X?" in a dispute — which is what the record is kept for.
 */
export function accountHashOf(email: string, env: Record<string, string | undefined> = process.env): string {
  if (!pseudonymPepperConfigured(env)) throw new PseudonymPepperMissingError();
  return 'hmac1_' + createHmac('sha256', env[PSEUDONYM_PEPPER_ENV] as string).update(normaliseAddress(email)).digest('hex');
}
