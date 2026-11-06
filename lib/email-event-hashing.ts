import { accountHashOf, pseudonymPepperConfigured, subjectHashOf } from './pseudonym';
import { isTestAccount } from './test-accounts';

/**
 * The delivery record of a mail (`email_events/{provider message id}`) keeps
 * the recipient and the subject as keyed hashes only — privacy policy sections
 * 2 and 6: "a hash is enough" (legal texts Fassung 1.1, 3.0.21).
 *
 * What it keeps in clear is what delivery evidence needs: the kind of mail,
 * the time, the provider's message id and the delivery status, and the
 * provider's diagnostic without any address in it. Its period is unchanged:
 * 90 days after sending (`mailDeliveryRecordExpiry`, `lib/proof-log.ts`).
 *
 * Pure (only `crypto` through `lib/pseudonym.ts`): the writers in
 * `lib/email-events.ts`, the one-off rewrite of older records
 * (`scripts/hash-email-events.ts`) and the specs share it.
 */

const HASH_PREFIX = 'hmac1_';

/** True for a value `accountHashOf` / `subjectHashOf` wrote. */
export function isKeyedHash(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

/**
 * What a delivery record keeps of the recipient and the subject: their keyed
 * hashes and nothing else. `to` holds the keyed hash of each address
 * (`accountHashOf`, the same value an erasure writes and the invitation
 * delivery records hold), so a record can still be found by the address when
 * the operator holds the pepper; `subjectHash` the keyed hash of the subject
 * line (`subjectHashOf`).
 *
 * Null without `PSEUDONYM_PEPPER`: then the record keeps neither — never the
 * address or the subject in clear.
 */
export function deliveryRecordHashes(
  input: { to: readonly string[]; subject?: string | null },
  env: Record<string, string | undefined> = process.env,
): { to: string[]; subjectHash: string | null } | null {
  if (!pseudonymPepperConfigured(env)) return null;
  return {
    to: input.to.filter((a) => typeof a === 'string' && a.trim() !== '').map((a) => (isKeyedHash(a) ? a : accountHashOf(a, env))),
    subjectHash: typeof input.subject === 'string' && input.subject !== '' ? subjectHashOf(input.subject, env) : null,
  };
}

const ADDRESS = /[^\s<>()"',;:@]+@[^\s<>()"',;:@]+\.[^\s<>()"',;:@]+/g;

/**
 * The provider's diagnostic (a bounce reason, a complaint type) without any
 * address in it: a bounce text often quotes the recipient ("550 5.1.1
 * <name@example.com>: Recipient address rejected"), and the record keeps the
 * address only as its hash.
 */
export function withoutAddresses(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  return text.replace(ADDRESS, '[address]');
}

/**
 * The update that brings a record written before 3.0.21 to that shape, or null
 * when it already has it. `del` is `FieldValue.delete()`.
 *
 *   - `to`: every address in clear becomes its keyed hash (a hash already
 *     there stays); a record whose address was a test account's is marked
 *     `testRecipient`, so the weekly report still leaves it out;
 *   - `subject`: removed, its keyed hash kept in `subjectHash`;
 *   - `lastDetail` and each `timeline[].detail`: any address in them replaced.
 *
 * Kind, message id, status, times, uid and `expiresAt` are not touched.
 */
export function planEmailEventRewrite(
  data: Record<string, unknown>,
  del: unknown,
  env: Record<string, string | undefined> = process.env,
): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};

  const rawTo = Array.isArray(data.to) ? data.to : typeof data.to === 'string' ? [data.to] : null;
  if (rawTo) {
    const addresses = rawTo.filter((a): a is string => typeof a === 'string' && a.trim() !== '');
    const plain = addresses.filter((a) => !isKeyedHash(a));
    if (plain.length > 0 || !Array.isArray(data.to) || addresses.length !== rawTo.length) {
      update.to = addresses.map((a) => (isKeyedHash(a) ? a : accountHashOf(a, env)));
      if (plain.some((a) => isTestAccount(a))) update.testRecipient = true;
    }
  }

  if ('subject' in data) {
    if (typeof data.subject === 'string' && data.subject !== '' && !isKeyedHash(data.subjectHash)) {
      update.subjectHash = subjectHashOf(data.subject, env);
    }
    update.subject = del;
  }

  if (typeof data.lastDetail === 'string') {
    const clean = withoutAddresses(data.lastDetail);
    if (clean !== data.lastDetail) update.lastDetail = clean;
  }

  if (Array.isArray(data.timeline)) {
    let changed = false;
    const timeline = data.timeline.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const e = entry as Record<string, unknown>;
      if (typeof e.detail !== 'string') return e;
      const clean = withoutAddresses(e.detail);
      if (clean === e.detail) return e;
      changed = true;
      return { ...e, detail: clean };
    });
    if (changed) update.timeline = timeline;
  }

  return Object.keys(update).length > 0 ? update : null;
}
