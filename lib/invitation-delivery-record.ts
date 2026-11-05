import { accountHashOf, pseudonymPepperConfigured } from './pseudonym';
import { mailStatusWins } from './mail-status';
import { logger } from './logger';
import { INVITATION_EMAIL_SUBJECT } from './invitation-email';
import { PORTFOLIO_INVITATION_SUBJECT } from './portfolio/invitation-email';

/**
 * The delivery record of an invitation mail — privacy policy sections 6 and 8:
 * "per invitation we keep a delivery record — the keyed hash of the address,
 * the person who invited, the time, the message id at the mail provider and
 * the delivery status — for six months from sending (§ 11 UWG), with the
 * keyed hash of the address only".
 *
 *   invitation_delivery_records/{provider message id}
 *     messageId, kind ('project' | 'portfolio'), recipientHash (hmac1_…),
 *     inviterUid, sentAt, status, statusAt, seenEventIds, retention, expiresAt
 *
 * **Its own collection, not `email_events`.** A delivery record in
 * `email_events` keeps the recipient's address in clear in `to` — written at
 * sending (`recordEmailSent`) and again by every webhook event
 * (`recordEmailEvent`) — plus the subject and the provider's bounce text, which
 * can quote the address; the admin console and the weekly report read it that
 * way, and its period is the open value `mailDeliveryRecordRetention` (90
 * days). An invitation goes to a person who gave us nothing, so its record
 * holds the keyed hash and never the address, and it is kept six months. Two
 * different shapes and periods under one collection would leave the guarantee
 * to whichever writer came last; a separate collection holds it by
 * construction — the same reasoning as `invitation_suppressions`
 * (`lib/invitation-suppression.ts`). Server-only, Admin SDK; `firestore.rules`
 * opens no path to it (default deny).
 *
 * **Deletion:** `expiresAt` is six calendar months after sending, and a
 * Firestore TTL policy on it deletes the record (`docs/DATA-RETENTION.md`,
 * checked by `npm run retention:verify`). When the inviting account is
 * erased, `inviterUid` gives way to the keyed hash of its address, as in
 * every other record that outlives it (`lib/proof-log-erasure.ts`).
 *
 * **Without `PSEUDONYM_PEPPER`** no keyed hash can be made, so no record is
 * written — rather than one with the address in clear — and a critical log
 * line says so. The invitation itself still goes out, as the suppression check
 * (which then answers "not suppressed") lets it.
 */

export const INVITATION_DELIVERY_RECORDS = 'invitation_delivery_records';

/** Calendar months a record is kept after sending (privacy policy sections 6 and 8). */
export const INVITATION_DELIVERY_RECORD_MONTHS = 6;

export const INVITATION_DELIVERY_RECORD_RETENTION = 'six-months-after-sending';

export type InvitationMailKind = 'project' | 'portfolio';

/**
 * Six calendar months after `sentAt`, in UTC, with the day clamped to the
 * length of the target month (31 August → 28/29 February).
 */
export function invitationDeliveryRecordExpiry(sentAt: Date): Date {
  const target = new Date(sentAt.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + INVITATION_DELIVERY_RECORD_MONTHS);
  const days = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(sentAt.getUTCDate(), days));
  return target;
}

/** The kind of invitation a subject line belongs to, or null for any other mail. */
export function invitationKindOfSubject(subject: unknown): InvitationMailKind | null {
  if (subject === INVITATION_EMAIL_SUBJECT) return 'project';
  if (subject === PORTFOLIO_INVITATION_SUBJECT) return 'portfolio';
  return null;
}

/** The record as written at sending. Null without the pepper. */
export function invitationDeliveryRecord(
  input: { messageId: string; recipient: string; inviterUid: string; kind: InvitationMailKind; sentAt: Date },
  env: Record<string, string | undefined> = process.env,
): Record<string, unknown> | null {
  if (!pseudonymPepperConfigured(env)) return null;
  return {
    messageId: input.messageId,
    kind: input.kind,
    recipientHash: accountHashOf(input.recipient, env),
    inviterUid: input.inviterUid,
    sentAt: input.sentAt,
    retention: INVITATION_DELIVERY_RECORD_RETENTION,
    expiresAt: invitationDeliveryRecordExpiry(input.sentAt),
  };
}

/* ----------------------------------------------------------- the writes */

interface Snap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface Tx {
  get(ref: unknown): Promise<Snap>;
  set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): unknown;
}
/** The two Firestore calls these writes need, so a spec can drive them in memory. */
export interface InvitationRecordDb {
  collection(name: string): { doc(id: string): unknown };
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/**
 * Written right after the provider accepted the mail. A transaction, because
 * the webhook can report the first event before this lands
 * (`recordInvitationEvent`): a status already there is kept.
 */
export async function recordInvitationSent(
  db: InvitationRecordDb,
  input: { messageId: string; recipient: string; inviterUid: string; kind: InvitationMailKind; sentAt?: Date },
  env: Record<string, string | undefined> = process.env,
): Promise<'recorded' | 'no-pepper'> {
  const record = invitationDeliveryRecord({ ...input, sentAt: input.sentAt ?? new Date() }, env);
  if (!record) {
    logger.critical('invitation delivery record not written: PSEUDONYM_PEPPER is not set', {
      kind: input.kind,
      messageId: input.messageId,
    });
    return 'no-pepper';
  }
  const ref = db.collection(INVITATION_DELIVERY_RECORDS).doc(input.messageId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() || {} : {};
    tx.set(ref, { ...record, status: typeof existing.status === 'string' ? existing.status : 'email.sent' }, { merge: true });
  });
  return 'recorded';
}

/**
 * A provider event for an invitation mail. Returns true when the message is an
 * invitation — its record updated, or created if the event outran the send —
 * and false for every other mail, which `recordEmailEvent` then records in
 * `email_events`. Only the status and its time are taken from the event: the
 * address, the subject and the provider's text are not stored. Without the
 * pepper an event that outran the send stores nothing.
 */
export async function recordInvitationEvent(
  db: InvitationRecordDb,
  input: { messageId: string; type: string; to: string[]; subject?: string | null; occurredAt?: string | null },
  eventId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const ref = db.collection(INVITATION_DELIVERY_RECORDS).doc(input.messageId);
  const kind = invitationKindOfSubject(input.subject);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists && !kind) return false;
    const at = input.occurredAt ?? new Date().toISOString();
    if (!snap.exists) {
      if (!pseudonymPepperConfigured(env) || !input.to[0]) return true;
      const now = new Date();
      tx.set(ref, {
        messageId: input.messageId,
        kind,
        recipientHash: accountHashOf(input.to[0], env),
        status: input.type,
        statusAt: at,
        seenEventIds: [eventId],
        retention: INVITATION_DELIVERY_RECORD_RETENTION,
        // Replaced by six months from `sentAt` once the send's own write lands.
        expiresAt: invitationDeliveryRecordExpiry(now),
      });
      return true;
    }
    const data = snap.data() || {};
    const seen: string[] = Array.isArray(data.seenEventIds) ? (data.seenEventIds as string[]) : [];
    if (seen.includes(eventId)) return true;
    const wins = mailStatusWins(typeof data.status === 'string' ? data.status : null, input.type);
    tx.set(
      ref,
      {
        ...(wins ? { status: input.type, statusAt: at } : {}),
        seenEventIds: [...seen, eventId].slice(-40),
      },
      { merge: true },
    );
    return true;
  });
}

/**
 * What an account erasure writes onto the records of invitations the account
 * sent: the inviter becomes the keyed hash of its address; the rest — the
 * recipient's hash, time, message id, status, deletion date — stays.
 */
export function pseudonymisedInviterFields(accountHash: string, del: unknown): Record<string, unknown> {
  return { inviterUid: del, inviterHash: accountHash };
}
