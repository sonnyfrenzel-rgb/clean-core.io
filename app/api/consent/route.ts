import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, QuotaError } from '@/lib/firebase-admin';
import { recordConsent } from '@/lib/consent';
import { sendContractConfirmationMail } from '@/lib/contract-confirmation-mail';
import { TERMS_VERSION } from '@/lib/constants';
import { logger, errMessage } from '@/lib/logger';
import { assertRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/consent
 *
 * F-16: Server-authoritative Terms/Privacy consent. Records an append-only
 * consent event (server timestamp, server-derived email, UID) and mirrors the
 * accepted version onto the user profile via the Admin SDK. The client cannot set
 * the version or timestamp itself — combined with the `requireCurrentTerms` gate
 * in assertAccountActive, this makes consent provable rather than client-asserted.
 *
 * The write itself lives in `lib/consent.ts`, shared with the registration route
 * so signup consent and re-consent produce the same record.
 *
 * Body: { termsVersion?, termsLanguage?, locale? }. The privacy version and the document hash
 * are server-derived — a record whose contents the consenting party chooses is
 * not evidence.
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyRequestAuth(req, { checkRevoked: true });
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Every call appends a record, so the account is metered like its
    // neighbours (community-mail, fetch-*-metadata).
    try {
      await assertRateLimit(`consent:${decoded.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      if (rateErr instanceof QuotaError) {
        return NextResponse.json({ error: rateErr.message }, { status: rateErr.status });
      }
      throw rateErr;
    }

    const body = await req.json().catch(() => ({}));
    const requested = typeof body?.termsVersion === 'string' ? body.termsVersion : TERMS_VERSION;
    // Only the current server-known Terms version may be recorded — a client cannot
    // "accept" an arbitrary future or foreign version.
    if (requested !== TERMS_VERSION) {
      return NextResponse.json({ error: 'Unknown Terms version.' }, { status: 400 });
    }

    // Server-derived email — never trust the client for identity.
    let email: string | null = decoded.email || null;
    const { db } = await getAdminDb();
    const profileSnap = await db.collection('users').doc(decoded.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    if (!email) email = profile.email || null;
    // An account with an earlier acceptance is accepting an amendment (Terms 10.2).
    const occasion = typeof profile.termsVersionAccepted === 'string' && profile.termsVersionAccepted ? 'amendment' : 'sign-up';

    // `privacyVersion` and `contentSha256` are no longer read from the body. They
    // were written verbatim into the append-only record, which let the consenting
    // party choose what the record said they consented to.
    const recorded = await recordConsent({
      uid: decoded.uid,
      email,
      source: 'api/consent',
      locale: typeof body?.locale === 'string' ? body.locale : null,
      // T02: the language version ticked in the dialog (C2) — the person's
      // choice of contract language, which the digest is then derived from.
      termsLanguage: body?.termsLanguage,
    });

    // C5 (Terms 10.2 and 1.3, T03): the confirmation of the acceptance, in the
    // language version accepted — best effort, to the server-derived address.
    await sendContractConfirmationMail({
      to: email,
      uid: decoded.uid,
      occasion,
      language: recorded.termsLanguage,
      firstName: typeof profile.firstName === 'string' ? profile.firstName : null,
    });

    return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION, termsLanguage: recorded.termsLanguage });
  } catch (err: unknown) {
    // The reason goes to the server log; the caller gets a fixed sentence.
    logger.error('consent record failed', {
      route: 'api/consent',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Failed to record consent.' }, { status: 500 });
  }
}
