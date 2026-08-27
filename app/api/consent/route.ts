import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
import { recordConsent } from '@/lib/consent';
import { TERMS_VERSION } from '@/lib/constants';

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
 * Body: { termsVersion?, locale? }. The privacy version and the document hash
 * are server-derived — a record whose contents the consenting party chooses is
 * not evidence.
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyRequestAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
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
    if (!email) {
      const { db } = await getAdminDb();
      const snap = await db.collection('users').doc(decoded.uid).get();
      email = snap.exists ? (snap.data()?.email || null) : null;
    }

    // `privacyVersion` and `contentSha256` are no longer read from the body. They
    // were written verbatim into the append-only record, which let the consenting
    // party choose what the record said they consented to.
    await recordConsent({
      uid: decoded.uid,
      email,
      source: 'api/consent',
      locale: typeof body?.locale === 'string' ? body.locale : null,
    });

    return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to record consent.' }, { status: 500 });
  }
}
