import { deleteUserDataAndAccount, getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { acceptedTermsLanguageOf } from '@/lib/consent';
import { sendWithdrawalReceiptMail } from '@/lib/withdrawal-receipt-mail';
import type { WithdrawalDeps } from '@/lib/withdrawal-declaration';
import {
  processQueuedReceipt,
  processWithdrawalQueue,
  queuedReceiptOf,
  WITHDRAWAL_PROFILE_FIELD,
  WITHDRAWAL_QUEUE_COLLECTION,
  type QueueDeps,
  type QueuedReceipt,
  type QueueStep,
} from '@/lib/withdrawal-queue';

/**
 * The database half of the withdrawal path and its receipt queue (legal review
 * 06.11.2026, B8) — server only. Every write is the Admin SDK's: the profile
 * fields `disabled` and `withdrawal` are not in `userClientUpdateKeys()` of
 * `firestore.rules`, and `withdrawal_receipt_queue` has no match block (default
 * deny), so no rules change.
 *
 * Blocking reuses the signal the whole product already honours:
 * `disabled: true` on the profile is refused by `assertAccountActive` on every
 * mutating route (so no model call), by `accountActive()` in the rules for the
 * account's own data, and by the community mail (`lib/community-mail.ts`). The
 * refresh tokens are revoked so the sessions end; the sign-in itself stays
 * possible, because a sign-in is one of the two moments the queue is worked
 * (`lib/withdrawal-queue.ts`).
 */

async function readProfile(uid: string) {
  try {
    const { db } = await getAdminDb();
    const profile = ((await db.collection('users').doc(uid).get()).data() ?? {}) as {
      termsLanguageAccepted?: unknown;
      firstName?: unknown;
      lastName?: unknown;
    };
    const name = [profile.firstName, profile.lastName].filter((p): p is string => typeof p === 'string').join(' ').trim();
    return { language: acceptedTermsLanguageOf(profile.termsLanguageAccepted), name };
  } catch {
    // The receipt goes out in English, unnamed.
    return { language: acceptedTermsLanguageOf(undefined), name: '' };
  }
}

async function record(row: Record<string, unknown>): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  await db.collection('consent_events').doc().create({ ...row, createdAt: FieldValue.serverTimestamp() });
}

async function block(uid: string, receivedAt: Date): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('users').doc(uid);
  // `update`, so an account erased in the meantime is not recreated.
  if ((await ref.get()).exists) {
    await ref.update({
      disabled: true,
      [WITHDRAWAL_PROFILE_FIELD]: { receivedAt: receivedAt.toISOString(), state: 'effective' },
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await (await getAdminAuth()).revokeRefreshTokens(uid).catch(() => {
    // The profile block above already holds every route and rule; a revocation that fails is not a reason to stop.
  });
}

async function enqueue(entry: QueuedReceipt): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  await db.collection(WITHDRAWAL_QUEUE_COLLECTION).doc(entry.uid).set({ ...entry, createdAt: FieldValue.serverTimestamp() });
  const ref = db.collection('users').doc(entry.uid);
  if ((await ref.get()).exists) {
    await ref.update({ [`${WITHDRAWAL_PROFILE_FIELD}.state`]: 'receipt-pending', updatedAt: FieldValue.serverTimestamp() });
  }
}

async function save(entry: QueuedReceipt): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  await db.collection(WITHDRAWAL_QUEUE_COLLECTION).doc(entry.uid).set({ ...entry, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function remove(uid: string): Promise<void> {
  const { db } = await getAdminDb();
  await db.collection(WITHDRAWAL_QUEUE_COLLECTION).doc(uid).delete();
}

export function withdrawalDeps(): WithdrawalDeps {
  return {
    now: () => new Date(),
    readProfile,
    record,
    block,
    enqueue,
    send: (input) => sendWithdrawalReceiptMail(input),
    erase: (uid, ending) => deleteUserDataAndAccount(uid, { ending }),
  };
}

export function withdrawalQueueDeps(): QueueDeps {
  const d = withdrawalDeps();
  return { now: d.now, readProfile: d.readProfile, record: d.record, send: d.send, erase: d.erase, save, remove };
}

/** The account's own pending receipt — at its sign-in. Null when there is none. */
export async function processOwnPendingWithdrawal(uid: string): Promise<QueueStep | null> {
  const { db } = await getAdminDb();
  const snap = await db.collection(WITHDRAWAL_QUEUE_COLLECTION).doc(uid).get();
  const entry = snap.exists ? queuedReceiptOf(uid, snap.data()) : null;
  if (!entry) return null;
  return processQueuedReceipt(entry, withdrawalQueueDeps(), { force: true });
}

/** Every pending receipt — the operator's action in the admin console. Counts only, never an address. */
export async function processAllPendingWithdrawals(limit = 50): Promise<Record<QueueStep | 'failed', number> & { pending: number }> {
  const { db } = await getAdminDb();
  const snap = await db.collection(WITHDRAWAL_QUEUE_COLLECTION).limit(limit).get();
  const entries = snap.docs
    .map((d: { id: string; data: () => Record<string, unknown> }) => queuedReceiptOf(d.id, d.data()))
    .filter((e: QueuedReceipt | null): e is QueuedReceipt => e !== null);
  const counts = await processWithdrawalQueue(entries, withdrawalQueueDeps(), { force: true });
  const left = await db.collection(WITHDRAWAL_QUEUE_COLLECTION).limit(limit).get();
  return { ...counts, pending: left.size };
}
