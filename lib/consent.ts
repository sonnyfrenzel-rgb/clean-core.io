import { getAdminDb } from '@/lib/firebase-admin';
import { TERMS_VERSION } from '@/lib/constants';

/**
 * Server-authoritative Terms/Privacy consent (finding V14).
 *
 * Consent used to be a pair of fields the browser wrote onto its own user
 * document at signup. The account therefore *claimed* an acceptance with no
 * independent record behind it, and the Firestore rules let it: both fields sat
 * in the client-writable create allowlist. This is the single place that records
 * one — an append-only `consent_events` row with a server timestamp and a
 * server-derived email, plus the mirror on the profile that
 * `assertAccountActive({ requireCurrentTerms })` reads.
 *
 * Both writes go through the Admin SDK. The client can no longer produce either.
 */

export interface RecordConsentInput {
  uid: string;
  /** Server-derived address; never taken from a request body. */
  email: string | null;
  /** Where the acceptance was collected, e.g. 'api/account/register'. */
  source: string;
  privacyVersion?: string | null;
  contentSha256?: string | null;
  locale?: string | null;
}

export async function recordConsent({
  uid,
  email,
  source,
  privacyVersion,
  contentSha256,
  locale,
}: RecordConsentInput): Promise<{ termsVersion: string }> {
  const { db, FieldValue } = await getAdminDb();

  // 1) append-only consent event (primary, tamper-evident record; userId lets the
  //    erasure cascade purge it on account deletion).
  await db.collection('consent_events').add({
    uid,
    userId: uid,
    email,
    termsVersion: TERMS_VERSION,
    privacyVersion: typeof privacyVersion === 'string' ? privacyVersion : TERMS_VERSION,
    contentSha256: typeof contentSha256 === 'string' ? contentSha256 : null,
    locale: typeof locale === 'string' ? locale : null,
    source,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 2) mirror the accepted version onto the profile (server timestamp).
  await db.collection('users').doc(uid).set(
    {
      termsVersionAccepted: TERMS_VERSION,
      termsAcceptedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { termsVersion: TERMS_VERSION };
}
