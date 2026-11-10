import { PROOF_LOG_RETENTION } from '@/lib/proof-log';
import type { MailOutcome } from '@/lib/transactional-mail';
import type { TermsLanguage } from '@/lib/terms-versions';
import {
  receiptRecord,
  WITHDRAWAL_ENDING,
  WITHDRAWAL_SOURCE,
  type WithdrawalDeps,
} from '@/lib/withdrawal-declaration';

/**
 * B8 of the legal review of 06.11.2026 (release 3.0.21) — a withdrawal whose
 * receipt could not be sent.
 *
 * The withdrawal is effective on submission (`lib/withdrawal-declaration.ts`):
 * the account is blocked at once, and the receipt that did not go out waits
 * here, one entry per account — `withdrawal_receipt_queue/{uid}`, Admin SDK
 * only (no match block in `firestore.rules`, so default deny; no rules change).
 * Each attempt is recorded in the proof log like the first one
 * (`withdrawal-receipt`). The account is deleted:
 *
 *   - right after a receipt that went out, or
 *   - at the latest `WITHDRAWAL_RECEIPT_DEADLINE_DAYS` after the declaration
 *     without one — with a proof-log note (`withdrawal-receipt-expired`) that
 *     says so, written before the erasure, so the erasure pseudonymises it
 *     with the other rows.
 *
 * **Who runs it.** This repository has no scheduler that can reach the Admin
 * SDK (the scheduled GitHub workflows run first-party code over Firestore REST
 * without `firebase-admin`, by design; there is no Cloud Scheduler job and no
 * cron route). So the queue is worked, without waiting for the next attempt
 * time, (1) when the account signs in again (`POST /api/account/signed-in`,
 * which the signed-in shell calls when the profile says a receipt is pending),
 * and (2) by the operator in the admin console ("Withdrawal receipts",
 * `POST /api/admin/console-action`, action `withdrawal-receipts`). A
 * scheduler that calls `processWithdrawalQueue` with due entries only is the
 * missing piece; `nextAttemptAt` is kept for it.
 *
 * Pure apart from its `deps`, so a spec drives it without a database.
 */

export const WITHDRAWAL_QUEUE_COLLECTION = 'withdrawal_receipt_queue';
/** The account is deleted at the latest this many days after the declaration. */
export const WITHDRAWAL_RECEIPT_DEADLINE_DAYS = 7;
/** The proof-log note when the account was deleted without a sent receipt. */
export const WITHDRAWAL_RECEIPT_EXPIRED_KIND = 'withdrawal-receipt-expired';
/** The profile field that says the withdrawal is received and its receipt pending. Admin SDK only. */
export const WITHDRAWAL_PROFILE_FIELD = 'withdrawal';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export interface QueuedReceipt {
  uid: string;
  /** The verified token's address at the declaration — the receipt goes there and nowhere else. */
  email: string;
  language: TermsLanguage;
  /** ISO time of receipt of the declaration. */
  receivedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string;
  deadlineAt: string;
  lastReason: string | null;
}

/** 5 min, 15 min, 1 h, 3 h, then every 6 h. */
export function retryDelayMs(attempts: number): number {
  const steps = [5 * MINUTE, 15 * MINUTE, 60 * MINUTE, 180 * MINUTE];
  return attempts - 1 < steps.length ? steps[Math.max(0, attempts - 1)] : 360 * MINUTE;
}

export function deadlineOf(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + WITHDRAWAL_RECEIPT_DEADLINE_DAYS * DAY);
}

/** The entry for a receipt that did not go out on its first attempt. */
export function queuedReceipt(input: { uid: string; email: string; language: TermsLanguage; receivedAt: Date; at: Date; reason: string | null }): QueuedReceipt {
  return {
    uid: input.uid,
    email: input.email,
    language: input.language,
    receivedAt: input.receivedAt.toISOString(),
    attempts: 1,
    lastAttemptAt: input.at.toISOString(),
    nextAttemptAt: new Date(input.at.getTime() + retryDelayMs(1)).toISOString(),
    deadlineAt: deadlineOf(input.receivedAt).toISOString(),
    lastReason: input.reason,
  };
}

/** An entry as stored, read defensively; null for anything that is not one. */
export function queuedReceiptOf(uid: string, d: Record<string, unknown> | undefined | null): QueuedReceipt | null {
  if (!d) return null;
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const email = s(d.email);
  const receivedAt = s(d.receivedAt);
  if (!email || !receivedAt || !Number.isFinite(Date.parse(receivedAt))) return null;
  return {
    uid,
    email,
    language: d.language === 'de' ? 'de' : 'en',
    receivedAt,
    attempts: typeof d.attempts === 'number' ? d.attempts : 1,
    lastAttemptAt: s(d.lastAttemptAt),
    nextAttemptAt: s(d.nextAttemptAt) ?? receivedAt,
    deadlineAt: s(d.deadlineAt) ?? deadlineOf(new Date(receivedAt)).toISOString(),
    lastReason: s(d.lastReason),
  };
}

/** The proof-log note: deleted after the deadline without a sent receipt. */
export function expiredRecord(input: { entry: QueuedReceipt; at: Date }): Record<string, unknown> {
  return {
    uid: input.entry.uid,
    userId: input.entry.uid,
    email: input.entry.email,
    kind: WITHDRAWAL_RECEIPT_EXPIRED_KIND,
    status: 'deleted-without-receipt',
    note: `The receipt could not be sent within ${WITHDRAWAL_RECEIPT_DEADLINE_DAYS} days of the declaration (${input.entry.attempts} attempts); the account is deleted without it.`,
    attempts: input.entry.attempts,
    lastReason: input.entry.lastReason,
    declarationReceivedAt: new Date(input.entry.receivedAt),
    deletedAt: input.at,
    source: WITHDRAWAL_SOURCE,
    retention: PROOF_LOG_RETENTION,
    expiresAt: null,
  };
}

export interface QueueDeps extends Pick<WithdrawalDeps, 'now' | 'readProfile' | 'record' | 'send' | 'erase'> {
  save(entry: QueuedReceipt): Promise<void>;
  remove(uid: string): Promise<void>;
}

export type QueueStep = 'sent-and-erased' | 'retry-later' | 'not-due' | 'expired-and-erased';

/**
 * One attempt for one entry. `force` (a sign-in, the operator's action) tries
 * now whatever `nextAttemptAt` says; without it an entry not yet due is left.
 * Past the deadline it is never sent again: the note, then the erasure.
 */
export async function processQueuedReceipt(entry: QueuedReceipt, deps: QueueDeps, opts: { force?: boolean } = {}): Promise<QueueStep> {
  const now = deps.now();
  if (now.getTime() >= Date.parse(entry.deadlineAt)) {
    await deps.record(expiredRecord({ entry, at: now }));
    await deps.erase(entry.uid, WITHDRAWAL_ENDING);
    await deps.remove(entry.uid);
    return 'expired-and-erased';
  }
  if (!opts.force && now.getTime() < Date.parse(entry.nextAttemptAt)) return 'not-due';

  const profile = await deps.readProfile(entry.uid);
  const outcome: MailOutcome = await deps.send({ to: entry.email, uid: entry.uid, language: entry.language, name: profile.name, receivedAt: entry.receivedAt });
  const at = deps.now();
  await deps.record(receiptRecord({ uid: entry.uid, email: entry.email, receivedAt: new Date(entry.receivedAt), at, outcome }));
  if (outcome.delivered) {
    await deps.erase(entry.uid, WITHDRAWAL_ENDING);
    await deps.remove(entry.uid);
    return 'sent-and-erased';
  }
  const attempts = entry.attempts + 1;
  await deps.save({
    ...entry,
    attempts,
    lastAttemptAt: at.toISOString(),
    nextAttemptAt: new Date(at.getTime() + retryDelayMs(attempts)).toISOString(),
    lastReason: outcome.reason,
  });
  return 'retry-later';
}

/** Works a list of entries one by one; a failure of one does not stop the others. */
export async function processWithdrawalQueue(
  entries: QueuedReceipt[],
  deps: QueueDeps,
  opts: { force?: boolean } = {},
): Promise<Record<QueueStep | 'failed', number>> {
  const counts: Record<QueueStep | 'failed', number> = { 'sent-and-erased': 0, 'retry-later': 0, 'not-due': 0, 'expired-and-erased': 0, failed: 0 };
  for (const entry of entries) {
    try {
      counts[await processQueuedReceipt(entry, deps, opts)] += 1;
    } catch {
      // Kept as it is; tried again on the next run. Nothing about the entry is logged.
      counts.failed += 1;
    }
  }
  return counts;
}
