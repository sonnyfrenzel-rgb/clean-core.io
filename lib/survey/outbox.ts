/**
 * The survey's send outbox: one record per recipient, claimed before the
 * provider is asked, settled after, counted from the records.
 *
 * Server-only (Admin SDK). `scripts/send-survey.ts` drives it; `tests/survey-outbox.spec.ts`
 * exercises it against the Firestore emulator, which is why it lives here and
 * not inside the script — the script is an entry point and cannot be imported
 * without running.
 *
 * Why an outbox at all: the send record used to be added after Resend had
 * accepted the message, so a crash or a failed write in between left a
 * delivered mail with no record, and the next run — seeing no record — sent it
 * again. Why claimed in a transaction: two `--apply` processes both read the
 * recipient list before either had written, both wrote, both sent. Why the
 * count is derived and written in a transaction: a counter incremented per
 * send drifted the moment one increment failed, and two runs writing a
 * snapshot each could put a stale number over a fresh one.
 */

import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';

export type SendState = 'sending' | 'sent' | 'failed';

export interface SendRecord {
  campaign: string;
  email: string;
  uid: string;
  /** Absent on records from before the outbox, which were only ever written after success. */
  state?: SendState;
  providerId?: string;
  detail?: string;
}

/** One deterministic record per recipient and campaign. */
export function sendRef(db: Firestore, campaign: string, uid: string): DocumentReference {
  return db.collection('email_sends').doc(`${campaign}__${uid}`);
}

/**
 * Claims the recipient for this run. True when this run may ask the provider;
 * false when another run already has (`sending`), or did (`sent`), or a record
 * from before the outbox says the mail went out. Only a refused send (`failed`)
 * is claimable again — that is what makes a re-run try those people once more.
 */
export async function claimSend(db: Firestore, campaign: string, recipient: { uid: string; email: string }): Promise<boolean> {
  const ref = sendRef(db, campaign, recipient.uid);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const state = snap.exists ? (snap.data()?.state as SendState | undefined) : undefined;
    if (snap.exists && state !== 'failed') return false;
    tx.set(ref, { campaign, email: recipient.email, uid: recipient.uid, state: 'sending', startedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

export async function completeSend(db: Firestore, campaign: string, uid: string, providerId: string): Promise<void> {
  await sendRef(db, campaign, uid).set({ state: 'sent', providerId, sentAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function failSend(db: Firestore, campaign: string, uid: string, detail: string): Promise<void> {
  await sendRef(db, campaign, uid).set({ state: 'failed', detail: detail.slice(0, 500), failedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** A record that says the mail went out: `sent`, or from before the outbox. */
export function countsAsInvited(record: Pick<SendRecord, 'state'> | undefined): boolean {
  const state = record?.state;
  return state === 'sent' || state === undefined;
}

/**
 * The records of a campaign by state — what a run reports, and what decides
 * who is still eligible: `sent` and `sending` are not asked again, `failed` is.
 */
export function classifySends(records: SendRecord[]): { sent: string[]; sending: string[]; failed: string[] } {
  const out = { sent: [] as string[], sending: [] as string[], failed: [] as string[] };
  for (const r of records) {
    if (r.state === 'failed') out.failed.push(r.email);
    else if (r.state === 'sending') out.sending.push(r.email);
    else out.sent.push(r.email);
  }
  return out;
}

/**
 * People the survey reached, written to the campaign document in one
 * transaction with the count that produced it. Two guarantees: the number
 * written is the number of records the transaction read (a record that
 * changes between read and commit makes Firestore run the step again), and it
 * never goes down — a send record is never un-sent, so a smaller number can
 * only be a staler one, and it is not written.
 */
export async function recordInvited(db: Firestore, campaign: string, campaignRef: DocumentReference): Promise<number> {
  return db.runTransaction(async (tx: Transaction) => {
    const [sends, current] = await Promise.all([
      tx.get(db.collection('email_sends').where('campaign', '==', campaign)),
      tx.get(campaignRef),
    ]);
    const counted = sends.docs.filter((d) => countsAsInvited(d.data() as SendRecord)).length;
    const stored = Number(current.data()?.invited ?? 0);
    const invited = Math.max(counted, Number.isFinite(stored) ? stored : 0);
    tx.set(campaignRef, { invited }, { merge: true });
    return invited;
  });
}
