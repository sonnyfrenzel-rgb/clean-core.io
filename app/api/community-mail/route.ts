import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  assertMfaSatisfied,
  assertAccountActive,
  getAdminDb,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { normaliseEmail, suppressionId } from '@/lib/unsubscribe-token';
import { COMMUNITY_MAIL_FIELD } from '@/lib/community-mail';

/**
 * POST /api/community-mail — the account's consent to community mail.
 *
 * Owner decision of 30.09.2026 (QA finding bef96e7f054f): survey invitations and
 * community updates go only to an account that switched them on here. Off by
 * default; nothing at sign-up sets it.
 *
 * Body: `{ optIn: true | false }`. Anything else is a 400 — a switch that
 * misreads its input and reports success is the one failure a consent record
 * cannot have.
 *
 * Written only here and by `POST /api/unsubscribe`, through the Admin SDK, as
 * `users/{uid}.communityMail` (`lib/community-mail.ts`). The field is not in
 * `userClientUpdateKeys()` of `firestore.rules`, so the browser cannot write it
 * and no rules deploy was needed. The profile is readable by its owner, so the
 * settings card shows the stored state without asking again.
 *
 * Both timestamps are kept: `consentedAt` is the latest opt-in, `withdrawnAt`
 * the latest withdrawal. Switching on also removes the address from the
 * suppression list — the account is asking for the mail again, and a stale
 * entry from an earlier unsubscribe would otherwise keep the switch "on" and
 * the mail off, with nothing on screen to say why. Profile and suppression move
 * in one batch.
 *
 * Opting in needs an active account under the current Terms; withdrawing does
 * not. Art. 7(3) GDPR: withdrawing must be as easy as giving, so a suspended
 * account can still say no.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const uid = decodedToken.uid;
    await assertMfaSatisfied(req, decodedToken);
    await assertRateLimit(`community_mail:${uid}:${getClientIp(req)}`, 30, 60 * 60 * 1000);

    const body = await req.json().catch(() => ({}));
    const optIn = (body as { optIn?: unknown }).optIn;
    if (typeof optIn !== 'boolean') {
      return NextResponse.json({ error: 'Expected { optIn: true } or { optIn: false }.' }, { status: 400 });
    }

    if (optIn) {
      await assertAccountActive(uid, {
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    }

    const { db, FieldValue } = await getAdminDb();
    const profileRef = db.collection('users').doc(uid);
    const profile = await profileRef.get();
    if (!profile.exists) {
      // Never create a profile from here: an erased account stays erased.
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const batch = db.batch();
    // `update` with field paths: the other half of the record is kept, and a
    // profile erased between the read and the commit fails the batch instead
    // of being recreated.
    batch.update(profileRef, {
      [`${COMMUNITY_MAIL_FIELD}.optIn`]: optIn,
      [`${COMMUNITY_MAIL_FIELD}.${optIn ? 'consentedAt' : 'withdrawnAt'}`]: FieldValue.serverTimestamp(),
      [`${COMMUNITY_MAIL_FIELD}.source`]: 'settings',
    });
    if (optIn) {
      const addresses = new Set(
        [profile.get('email'), decodedToken.email]
          .filter((a): a is string => typeof a === 'string' && a.trim() !== '')
          .map(normaliseEmail),
      );
      for (const address of addresses) {
        batch.delete(db.collection('email_suppressions').doc(suppressionId(address)));
      }
    }
    await batch.commit();

    logger.info('community mail consent changed', { route: 'api/community-mail', optIn });
    return NextResponse.json({ ok: true, optIn });
  } catch (err: unknown) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error('community mail consent not stored', { route: 'api/community-mail', error: errMessage(err) });
    return NextResponse.json({ error: 'The setting could not be saved.' }, { status: 500 });
  }
}
