import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';
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
 * Body: { termsVersion?, privacyVersion?, contentSha256?, locale? }
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

    const { db, FieldValue } = await getAdminDb();

    // Server-derived email — never trust the client for identity.
    let email: string | null = decoded.email || null;
    if (!email) {
      const snap = await db.collection('users').doc(decoded.uid).get();
      email = snap.exists ? (snap.data()?.email || null) : null;
    }

    // 1) append-only consent event (primary, tamper-evident record; userId lets the
    //    erasure cascade purge it on account deletion).
    await db.collection('consent_events').add({
      uid: decoded.uid,
      userId: decoded.uid,
      email,
      termsVersion: TERMS_VERSION,
      privacyVersion: typeof body?.privacyVersion === 'string' ? body.privacyVersion : TERMS_VERSION,
      contentSha256: typeof body?.contentSha256 === 'string' ? body.contentSha256 : null,
      locale: typeof body?.locale === 'string' ? body.locale : null,
      source: 'api/consent',
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2) mirror the accepted version onto the profile (server timestamp).
    await db.collection('users').doc(decoded.uid).set({
      termsVersionAccepted: TERMS_VERSION,
      termsAcceptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to record consent.' }, { status: 500 });
  }
}
