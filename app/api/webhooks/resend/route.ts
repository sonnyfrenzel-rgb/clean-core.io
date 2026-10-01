import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyResendSignature, recordEmailEvent, type EmailEventType } from '@/lib/email-events';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';

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
 * Answers 2xx once the signature checks out, including for payloads it does
 * not understand: a webhook that returns an error is retried, and retrying an
 * event we will never handle is noise for both sides. The one exception is an
 * event that could not be stored — that is ours, it is transient, and only a
 * non-2xx gets it delivered again (recording is idempotent per svix-id).
 */

/**
 * A Resend event is a few kilobytes of JSON. The body is read before the
 * signature can be checked, and the route is unauthenticated, so it is read
 * under a bound and a deadline rather than buffered whole (QA full review of
 * fc787674705f, 81ed8ba6a1db). Decoded exactly as `req.text()` decodes, so the
 * signature covers the same string.
 */
const WEBHOOK_BODY_LIMITS = { maxBytes: 256 * 1024, timeoutMs: 10_000 };
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
  let body: string;
  try {
    body = await readBoundedBody(new Response(req.body, { headers: req.headers }), WEBHOOK_BODY_LIMITS);
  } catch (bodyErr) {
    if (bodyErr instanceof ResponseLimitError) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    }
    throw bodyErr;
  }

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

    // A failed write is not acknowledged. It fell into the catch below and was
    // answered 200, so an event that met a Firestore hiccup was never
    // delivered again (QA full review of fc787674705f, 445e3934cbdd).
    try {
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
    } catch (storeErr) {
      logger.error('resend webhook event not stored', {
        route: 'api/webhooks/resend',
        type,
        messageId,
        error: errMessage(storeErr),
      });
      return NextResponse.json({ ok: false, retryable: true }, { status: 503 });
    }

    // Anything that means the reader did not get it is worth a log line of its
    // own, because that is the case somebody has to act on. The message id is
    // the handle; the address and the provider's diagnostic stay in
    // `email_events`, which is server-only, and out of the application log
    // (QA full review of fc787674705f, a488f527bff9).
    if (type === 'email.bounced' || type === 'email.complained') {
      logger.error('email did not reach the recipient', {
        route: 'api/webhooks/resend',
        type,
        messageId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    logger.error('resend webhook processing failed', {
      route: 'api/webhooks/resend',
      error: errMessage(err),
    });
    // The signature was valid, so the sender is genuine; a parsing failure is
    // ours and retrying will not fix it. (A storage failure is answered above.)
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
