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
  /**
   * The reader's own locale. Descriptive, not a claim about what they accepted,
   * so it is the one field here a caller may still supply.
   */
  locale?: string | null;
}

/**
 * Deliberately no `privacyVersion` or `contentSha256` parameter.
 *
 * Both were accepted from the request body and written straight into the
 * append-only record, so an authenticated caller could post
 * `privacyVersion: 'future-approved'` and an arbitrary hash and have the
 * immutable audit trail state acceptance of a document this server never served.
 * A consent record whose contents the consenting party chooses is not evidence.
 *
 * The privacy notice is versioned together with the Terms, so the version is
 * derived. `contentSha256` stays null until there is a versioned artifact on
 * disk to hash — hashing a React page's rendered output would change with every
 * build and prove nothing.
 */

export async function recordConsent({
  uid,
  email,
  source,
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
    privacyVersion: TERMS_VERSION,
    contentSha256: null,
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
