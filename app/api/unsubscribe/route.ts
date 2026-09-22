import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { logger, errMessage } from '@/lib/logger';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyUnsubscribeToken, normaliseEmail } from '@/lib/unsubscribe-token';
import { APP_BASE_URL } from '@/lib/constants';

/**
 * One-click unsubscribe for bulk community mail (RFC 8058).
 *
 * Deliberately unauthenticated: the recipient must be able to opt out from their
 * mail client without ever visiting the app. Authorisation comes from the signed
 * token instead of a session — see `lib/unsubscribe-token.ts`.
 *
 *   POST /api/unsubscribe       the token in a JSON body `{ t }` when our own
 *                               confirmation page sends it, or as `?t=…` for the
 *                               one-click target named in `List-Unsubscribe`.
 *                               Mail providers POST here with no session and no
 *                               JSON body. A token that cannot be verified is
 *                               answered 200: it will not verify on a retry, and
 *                               a non-2xx reads to the provider as a broken
 *                               unsubscribe. A *verified* opt-out that could not
 *                               be stored is answered 503, because that one is
 *                               worth retrying and a silent 200 loses it.
 *   GET  /api/unsubscribe?t=…   a human clicked the visible footer link — hand
 *                               them the confirmation page rather than acting on
 *                               a GET, which link scanners and prefetchers follow.
 *
 * Suppressions are keyed by SHA-256 of the normalised address: a stable document
 * id that is safe in a path and keeps the raw address out of the key space. The
 * address is still stored in the document — the sender has to compare against it,
 * and an opt-out record with no address would be useless.
 */

export const dynamic = 'force-dynamic';

function suppressionId(email: string): string {
  return createHash('sha256').update(normaliseEmail(email)).digest('hex');
}

async function suppress(email: string, source: 'one-click' | 'confirmation-page'): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  await db
    .collection('email_suppressions')
    .doc(suppressionId(email))
    .set(
      {
        email: normaliseEmail(email),
        list: 'community-updates',
        source,
        unsubscribedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/**
 * The token, from the body if the caller put it there, otherwise from the query.
 *
 * Both halves are needed, and the order matters. `/unsubscribe` — our own page —
 * now sends it in the body, because a token in the query of a request the page
 * itself makes lands in the browser history and in the Cloud Run access log while
 * it is still valid. RFC 8058 one-click providers cannot do that: they POST to the
 * URL out of `List-Unsubscribe`, with no body at all, so the query must keep
 * working for them.
 *
 * The body is read defensively — those providers send no JSON, and a rejected
 * parse must not turn a valid one-click unsubscribe into an error.
 */
function tokenInBody(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const t = Reflect.get(body, 't');
  return typeof t === 'string' ? t : '';
}

async function tokenFrom(req: NextRequest): Promise<string> {
  try {
    const fromBody = tokenInBody(await req.json());
    if (fromBody) return fromBody;
  } catch {
    // No body, or not JSON — the one-click case. Fall through to the query.
  }
  return req.nextUrl.searchParams.get('t') || '';
}

export async function POST(req: NextRequest) {
  const token = await tokenFrom(req);

  let email: string;
  try {
    email = verifyUnsubscribeToken(token);
  } catch (error) {
    // A token that does not verify will not verify on a retry either. Answering
    // 200 here is deliberate: a non-2xx on the one-click endpoint is read by the
    // provider as a broken unsubscribe and costs more sender reputation than the
    // forged or expired token it came from. The attempt is logged so a real
    // problem stays visible.
    logger.error('unsubscribe rejected', { route: 'api/unsubscribe', error: errMessage(error) });
    return NextResponse.json({ success: false }, { status: 200 });
  }

  try {
    await suppress(email, 'one-click');
  } catch (error) {
    // A verified opt-out that could not be stored is a different case, and it used
    // to answer 200 as well: Firestore was briefly unavailable, nothing was
    // suppressed, the provider saw success and never retried, and the person went
    // on receiving community mail after asking not to (QA review of 33471220d6e9,
    // finding 0a0ff08e1793). 503 is the one answer that gets the opt-out another
    // attempt; RFC 8058 providers retry it, and a transient 503 does not carry the
    // reputational weight of answering the unsubscribe itself as broken.
    logger.error('unsubscribe not stored', { route: 'api/unsubscribe', error: errMessage(error) });
    return NextResponse.json({ success: false, retryable: true }, { status: 503 });
  }

  logger.info('unsubscribe accepted', { route: 'api/unsubscribe', source: 'one-click' });
  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || '';
  const target = new URL('/unsubscribe', APP_BASE_URL);
  if (token) target.searchParams.set('t', token);
  return NextResponse.redirect(target, 302);
}
