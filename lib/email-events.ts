import crypto from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * What happened to a message after Resend accepted it.
 *
 * A 200 from `POST /emails` means "queued for sending" and nothing more. The
 * platform treated that as success, logged "Sent", and never learned anything
 * else — so a welcome mail that a corporate filter quarantined looked identical
 * to one that landed in an inbox. The registration flow hangs entirely on that
 * one message, and thirty community accounts were onboarded without anybody
 * being able to say whether the mail reached them.
 *
 * These events close that gap. `POST /api/webhooks/resend` records them; the
 * admin console reads them.
 */

export type EmailEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked';

/**
 * Ordered worst-to-best is deliberate: a message that bounces after a delivery
 * event has still bounced, and the summary must not be overwritten by a later
 * `opened` from a scanner. Only a strictly higher rank replaces the current one,
 * except for the terminal negatives, which always win.
 */
const RANK: Record<string, number> = {
  'email.sent': 1,
  'email.delivery_delayed': 2,
  'email.delivered': 3,
  'email.opened': 4,
  'email.clicked': 5,
};
const TERMINAL_NEGATIVE = new Set(['email.bounced', 'email.complained']);

export interface EmailEventInput {
  /** Resend's message id — the join key between the send and everything after. */
  messageId: string;
  type: EmailEventType | string;
  to: string[];
  subject?: string | null;
  /** Bounce reason, complaint type, whatever the payload carried. */
  detail?: string | null;
  /** The event's own timestamp from Resend, not our clock. */
  occurredAt?: string | null;
}

/**
 * Verifies a Resend webhook signature.
 *
 * Resend signs through Svix: `svix-id`, `svix-timestamp`, `svix-signature`, and a
 * secret of the form `whsec_<base64>`. The signed payload is
 * `${id}.${timestamp}.${body}` and the header carries one or more
 * space-separated `v1,<base64>` candidates, because a secret can be rotated with
 * an overlap window.
 *
 * Implemented here rather than pulling in the `svix` package: it is twenty lines
 * of HMAC, and adding a dependency means regenerating the lockfile, which on
 * this machine's npm is its own hazard.
 */
export function verifyResendSignature(opts: {
  body: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  secret: string;
  /** Reject anything older than this; replay protection. Default five minutes. */
  toleranceSeconds?: number;
  now?: number;
}): { valid: boolean; reason?: string } {
  const { body, svixId, svixTimestamp, svixSignature, secret } = opts;
  if (!svixId || !svixTimestamp || !svixSignature) return { valid: false, reason: 'missing-headers' };
  if (!secret) return { valid: false, reason: 'no-secret' };

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: 'bad-timestamp' };
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > tolerance) return { valid: false, reason: 'stale-timestamp' };

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${body}`)
    .digest('base64');

  // The header may carry several versions; any one matching is enough.
  const candidates = svixSignature
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3));

  const expectedBuf = Buffer.from(expected, 'base64');
  for (const candidate of candidates) {
    const buf = Buffer.from(candidate, 'base64');
    if (buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf)) {
      return { valid: true };
    }
  }
  return { valid: false, reason: 'signature-mismatch' };
}

/**
 * Records one event and keeps a per-message summary that is cheap to read.
 *
 * Idempotent on the event id, because a webhook is retried until it is
 * acknowledged and a duplicate must not become a second timeline entry.
 */
export async function recordEmailEvent(input: EmailEventInput, eventId: string): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('email_events').doc(input.messageId);

  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const seen: string[] = Array.isArray(data.seenEventIds) ? data.seenEventIds : [];
    if (seen.includes(eventId)) return; // already recorded

    const currentRank = RANK[data.status] ?? 0;
    const incomingRank = RANK[input.type] ?? 0;
    const isNegative = TERMINAL_NEGATIVE.has(input.type);
    const currentIsNegative = TERMINAL_NEGATIVE.has(data.status);

    // A negative verdict always wins; otherwise only a better rank replaces it.
    const status =
      isNegative || (!currentIsNegative && incomingRank > currentRank) ? input.type : data.status || input.type;

    tx.set(
      ref,
      {
        messageId: input.messageId,
        to: input.to,
        subject: input.subject ?? data.subject ?? null,
        status,
        lastDetail: input.detail ?? data.lastDetail ?? null,
        lastEventAt: input.occurredAt ?? new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
        // Capped: a message with a pathological retry loop must not grow a
        // document past Firestore's 1 MB limit.
        seenEventIds: [...seen, eventId].slice(-40),
        timeline: [
          ...(Array.isArray(data.timeline) ? data.timeline : []),
          { type: input.type, at: input.occurredAt ?? new Date().toISOString(), detail: input.detail ?? null },
        ].slice(-40),
      },
      { merge: true },
    );
  });
}

/** Written at send time so a message is visible before any webhook arrives. */
export async function recordEmailSent(messageId: string, to: string, subject: string, kind: string): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  await db.collection('email_events').doc(messageId).set(
    {
      messageId,
      to: [to],
      subject,
      kind,
      status: 'email.sent',
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
