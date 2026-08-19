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
 *   POST /api/unsubscribe?t=…   the one-click target named in `List-Unsubscribe`.
 *                               Mail providers POST here with no session and no
 *                               JSON body; anything returning non-2xx here counts
 *                               against sender reputation, so failures are soft.
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

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || '';

  try {
    const email = verifyUnsubscribeToken(token);
    await suppress(email, 'one-click');
    logger.info('unsubscribe accepted', { route: 'api/unsubscribe', source: 'one-click' });
    return NextResponse.json({ success: true });
  } catch (error) {
    // Never fail loudly at a mail provider: a non-2xx on the one-click endpoint is
    // read as a broken unsubscribe and damages sender reputation more than the
    // failed opt-out itself. The attempt is logged so a real problem stays visible.
    logger.error('unsubscribe failed', { route: 'api/unsubscribe', error: errMessage(error) });
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || '';
  const target = new URL('/unsubscribe', APP_BASE_URL);
  if (token) target.searchParams.set('t', token);
  return NextResponse.redirect(target, 302);
}
