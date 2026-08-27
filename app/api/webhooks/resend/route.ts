import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyResendSignature, recordEmailEvent, type EmailEventType } from '@/lib/email-events';

/**
 * POST /api/webhooks/resend
 *
 * What happened to a message after Resend accepted it.
 *
 * The platform used to learn nothing after `POST /emails` returned 200. A
 * welcome mail quarantined by a corporate filter and one that landed in an inbox
 * produced identical logs — and the entire registration flow hangs on that one
 * message. Thirty community accounts were onboarded without anybody being able
 * to say whether the mail arrived, which is a plausible explanation for how
 * little the platform is used.
 *
 * Unauthenticated by necessity: Resend cannot hold a Firebase token. The
 * signature is the authentication, and without `RESEND_WEBHOOK_SECRET` the route
 * refuses every request rather than accepting unsigned ones — an endpoint that
 * writes to Firestore on anyone's say-so would be worse than no endpoint.
 *
 * Always answers 2xx once the signature checks out, including for payloads it
 * does not understand. A webhook that returns an error is retried, and retrying
 * an event we will never handle is noise for both sides.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('resend webhook called but RESEND_WEBHOOK_SECRET is not configured', {
      route: 'api/webhooks/resend',
    });
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  // The raw body, before any parsing: the signature covers the exact bytes.
  const body = await req.text();

  const check = verifyResendSignature({
    body,
    svixId: req.headers.get('svix-id'),
    svixTimestamp: req.headers.get('svix-timestamp'),
    svixSignature: req.headers.get('svix-signature'),
    secret,
  });
  if (!check.valid) {
    logger.error('resend webhook signature rejected', {
      route: 'api/webhooks/resend',
      reason: check.reason,
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    const type: string = payload?.type || '';
    const data = payload?.data || {};
    const messageId: string = data?.email_id || data?.id || '';

    if (!messageId || !type.startsWith('email.')) {
      // Acknowledged, not acted on. See the note above about retries.
      return NextResponse.json({ ok: true, ignored: true });
    }

    const to: string[] = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];

    // Bounces and complaints carry the only text worth keeping: why.
    const detail =
      data?.bounce?.message ||
      data?.bounce?.subType ||
      data?.reason ||
      data?.complaint?.type ||
      null;

    // Svix guarantees a unique id per delivery attempt, which is what makes the
    // record idempotent under retries.
    const eventId = req.headers.get('svix-id') || `${messageId}:${type}:${data?.created_at || ''}`;

    await recordEmailEvent(
      {
        messageId,
        type: type as EmailEventType,
        to,
        subject: data?.subject ?? null,
        detail,
        occurredAt: payload?.created_at || data?.created_at || null,
      },
      eventId,
    );

    // Anything that means the reader did not get it is worth a log line of its
    // own, because that is the case somebody has to act on.
    if (type === 'email.bounced' || type === 'email.complained') {
      logger.error('email did not reach the recipient', {
        route: 'api/webhooks/resend',
        type,
        messageId,
        to: to.join(', '),
        detail,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    logger.error('resend webhook processing failed', {
      route: 'api/webhooks/resend',
      error: errMessage(err),
    });
    // The signature was valid, so the sender is genuine; a parsing failure is
    // ours and retrying will not fix it.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
