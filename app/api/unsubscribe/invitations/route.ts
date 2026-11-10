import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { INVITATION_SUPPRESSIONS, invitationSuppressionKey } from '@/lib/invitation-suppression';
import { readBoundedBody } from '@/lib/url-validation';

/**
 * POST /api/unsubscribe/invitations — the unsubscribe link of an invitation
 * mail (C10 for a project, C12 for a portfolio; privacy policy section 8).
 *
 * Unauthenticated, like the community-mail unsubscribe (`app/api/unsubscribe`):
 * the person never had to have an account, and the signed token
 * (`lib/unsubscribe-token.ts`, purpose `inv-unsub`) is the authorisation.
 * The token comes in a JSON body `{ t }` from the confirmation page
 * `/unsubscribe/invitations`, or as `?t=` for a client that posts the URL.
 *
 * What it stores is the keyed hash of the address on the invitation
 * suppression list (`lib/invitation-suppression.ts`), and nothing else — no
 * address, no account. A token that does not verify is answered 200 with
 * `success: false` (a retry would not verify either); a verified opt-out that
 * could not be stored is answered 503, because that one is worth retrying.
 */
export const dynamic = 'force-dynamic';

const BODY_LIMITS = { maxBytes: 8 * 1024, timeoutMs: 5_000 };

async function tokenFrom(req: NextRequest): Promise<string> {
  try {
    const body = JSON.parse(await readBoundedBody(req, BODY_LIMITS)) as unknown;
    const t = typeof body === 'object' && body !== null ? Reflect.get(body, 't') : '';
    if (typeof t === 'string' && t) return t;
  } catch {
    // No body, not JSON, or over the bound: the query decides.
  }
  return req.nextUrl.searchParams.get('t') || '';
}

export async function POST(req: NextRequest) {
  let email: string;
  try {
    email = verifyUnsubscribeToken(await tokenFrom(req), 'inv-unsub');
  } catch (error) {
    logger.error('invitation unsubscribe rejected', { route: 'api/unsubscribe/invitations', error: errMessage(error) });
    return NextResponse.json({ success: false }, { status: 200 });
  }

  const key = invitationSuppressionKey(email);
  if (!key) {
    logger.error('invitation unsubscribe not stored: no pseudonym key', { route: 'api/unsubscribe/invitations' });
    return NextResponse.json({ success: false, retryable: true }, { status: 503 });
  }
  try {
    const { db, FieldValue } = await getAdminDb();
    await db
      .collection(INVITATION_SUPPRESSIONS)
      .doc(key)
      .set({ list: 'invitations', keyed: true, source: 'confirmation-page', unsubscribedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (error) {
    logger.error('invitation unsubscribe not stored', { route: 'api/unsubscribe/invitations', error: errMessage(error) });
    return NextResponse.json({ success: false, retryable: true }, { status: 503 });
  }
  logger.info('invitation unsubscribe accepted', { route: 'api/unsubscribe/invitations' });
  return NextResponse.json({ success: true });
}
