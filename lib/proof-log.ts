import { createHmac } from 'crypto';
import { openValue } from '@/lib/legal/open-values';

/**
 * The proof log of the legal texts, Fassung 1.1 (acceptance tests T05/T06):
 * what the records of an acceptance, an ending and a deletion keep, for how
 * long, and how an erased account is named in them.
 *
 * Privacy policy, sections 2, 5 and 6, and Terms 1.3 say:
 *
 * - every record carries its **own deletion date**, and a nightly routine
 *   deletes what has expired. Here: each record has an `expiresAt` field, and a
 *   Firestore TTL policy on it deletes the record once that time has passed
 *   (Google runs the TTL sweep continuously and deletes an expired document
 *   typically within 24 hours — the "nightly routine"; the policies are created
 *   by hand, `docs/DATA-RETENTION.md`). While the contract runs, the deletion
 *   date of an acceptance record is not yet known — it depends on when the
 *   contract ends — so `expiresAt` is null (TTL ignores a null) and
 *   `retention` names the rule;
 * - after the contract ends, account and address in a record are replaced by a
 *   **keyed hash of the address** (HMAC with a secret pepper), and the record
 *   is kept until the end of the third calendar year after the end
 *   (§§ 195, 199 BGB; contract ended 13 October 2026 → deleted on
 *   31 December 2029);
 * - a deletion note "account (hash) deleted on [date]" is kept three years;
 * - a delivery record of a mail is kept for the period of the open value
 *   `mailDeliveryRecordRetention` after sending, after erasure only with the
 *   hash of the address.
 *
 * Pure apart from `crypto`, so specs drive it without a database.
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
 * The keyed hash that names an erased account in the proof log: HMAC-SHA256
 * under `PSEUDONYM_PEPPER` of the normalised address, prefixed so a reader can
 * tell it from a plain digest. Without the pepper nobody can recompute it from
 * an address list; with it, the operator can answer "did this address accept
 * version X?" in a dispute — which is what the record is kept for.
 */
export function accountHashOf(email: string, env: Record<string, string | undefined> = process.env): string {
  if (!pseudonymPepperConfigured(env)) throw new PseudonymPepperMissingError();
  return 'hmac1_' + createHmac('sha256', env[PSEUDONYM_PEPPER_ENV] as string).update(normaliseAddress(email)).digest('hex');
}

/** How a contract ended, as the proof log records it (privacy section 5). */
export type ContractEnding = 'account-deletion' | 'termination-by-operator';

/** The rule an acceptance record is kept under while the contract runs. */
export const PROOF_LOG_RETENTION = 'until-end-of-third-calendar-year-after-contract-end';

/** Years after the end of the contract's calendar year (§§ 195, 199 BGB). */
export const PROOF_LOG_YEARS_AFTER_CONTRACT_END = 3;

/**
 * The deletion date of a proof record once the contract has ended: 31 December
 * of the third calendar year after the year it ended in, at 00:00 UTC, so the
 * TTL sweep removes it on that day (privacy section 5: ended 13 October 2026 →
 * deleted on 31 December 2029).
 */
export function proofLogExpiry(contractEndedAt: Date): Date {
  return new Date(Date.UTC(contractEndedAt.getUTCFullYear() + PROOF_LOG_YEARS_AFTER_CONTRACT_END, 11, 31));
}

/** The deletion note is kept three years from the deletion (privacy sections 5 and 6). */
export const ERASURE_NOTE_YEARS = 3;

export function erasureNoteExpiry(deletedAt: Date): Date {
  const d = new Date(deletedAt.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + ERASURE_NOTE_YEARS);
  return d;
}

/** The collection of the deletion notes. Admin SDK only — no rule names it. */
export const ERASURE_NOTES = 'erasure_notes';

/**
 * Days a delivery record of a mail to an account is kept, read from the open
 * value the privacy policy renders (section 6), so the text and the code
 * cannot name two periods.
 */
export function mailDeliveryRecordDays(): number {
  const v = openValue('mailDeliveryRecordRetention').value;
  const m = v ? /^(\d+)\s/.exec(v.en) : null;
  if (!m) throw new Error('mailDeliveryRecordRetention is not a period in days');
  return Number(m[1]);
}

export function mailDeliveryRecordExpiry(sentAt: Date): Date {
  return new Date(sentAt.getTime() + mailDeliveryRecordDays() * 24 * 60 * 60 * 1000);
}

/** The collections whose records outlive an erased account, pseudonymised. */
export const PROOF_LOG_COLLECTIONS = ['consent_events', 'byok_agreement_events'] as const;

/**
 * The fields an erasure writes onto a proof record: the address and the uid go,
 * the keyed hash, the end of the contract and the deletion date come. Version,
 * language, digest, place and time of the acceptance stay — they are the proof.
 * `del` is `FieldValue.delete()`.
 */
export function pseudonymisedProofFields(
  input: { accountHash: string; endedAt: Date; ending: ContractEnding },
  del: unknown,
): Record<string, unknown> {
  return {
    uid: del,
    userId: del,
    email: del,
    locale: del,
    accountHash: input.accountHash,
    contractEndedAt: input.endedAt,
    contractEnding: input.ending,
    expiresAt: proofLogExpiry(input.endedAt),
  };
}

/** The record of the end of the contract itself (privacy section 6, "End of the contract"). */
export function contractEndRecord(input: { accountHash: string; endedAt: Date; ending: ContractEnding }): Record<string, unknown> {
  return {
    kind: 'contract-ended',
    accountHash: input.accountHash,
    contractEndedAt: input.endedAt,
    contractEnding: input.ending,
    retention: PROOF_LOG_RETENTION,
    expiresAt: proofLogExpiry(input.endedAt),
    createdAt: input.endedAt,
  };
}

/** The deletion note "account (hash) deleted on [date]". */
export function erasureNoteRecord(input: { accountHash: string; deletedAt: Date; ending: ContractEnding }): Record<string, unknown> {
  return {
    accountHash: input.accountHash,
    deletedAt: input.deletedAt,
    contractEnding: input.ending,
    expiresAt: erasureNoteExpiry(input.deletedAt),
  };
}

/**
 * The fields an erasure writes onto a delivery record of a mail to the account:
 * the hash takes the place of the address; subject and the bounce text (which
 * can quote the address) go; kind, time, message id and status stay, and the
 * record keeps its own deletion date (set at sending, or here for an older
 * record that had none).
 */
export function pseudonymisedDeliveryFields(
  input: { accountHash: string; sentAt: Date | null; now: Date },
  del: unknown,
): Record<string, unknown> {
  return {
    to: [input.accountHash],
    uid: del,
    subject: del,
    lastDetail: del,
    timeline: del,
    expiresAt: mailDeliveryRecordExpiry(input.sentAt ?? input.now),
  };
}
