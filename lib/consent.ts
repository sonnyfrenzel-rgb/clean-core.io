import { getAdminDb } from '@/lib/firebase-admin';
import { TERMS_VERSION } from '@/lib/constants';
import { archivedTermsSha256 } from '@/lib/terms-versions';

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
 * derived. `contentSha256` used to be null for a reason worth keeping on the
 * record: there was nothing honest to put there. The only text of the Terms was
 * a React page, and a hash of its rendered output moves with every build, every
 * Tailwind class and every release stamp in its footer — it would have looked
 * like evidence of the wording while proving nothing about it.
 *
 * `lib/terms-versions.ts` removed that obstacle rather than the field: a
 * published version now exists as a file under `docs/terms/` that never changes
 * again, and the digest of that file is the wording. So the record carries it,
 * derived on the server from the version it is recording, exactly like the
 * version itself.
 *
 * A version with no archived text records null and not a substitute. The whole
 * point of the field is that it names the words the account was shown; another
 * version's digest, or a hash of something adjacent, would be an immutable
 * statement that the account accepted words it never saw. Null says "the
 * wording is not pinned for this version", which is true and checkable.
 */

export async function recordConsent({
  uid,
  email,
  source,
  locale,
}: RecordConsentInput): Promise<{ termsVersion: string }> {
  const { db, FieldValue } = await getAdminDb();

  // The wording of the version being accepted, as a digest. Null while that
  // version has no archived text — see the note above on why null and not a
  // stand-in.
  const contentSha256 = archivedTermsSha256(TERMS_VERSION);

  // 1) append-only consent event (primary, tamper-evident record; userId lets the
  //    erasure cascade purge it on account deletion).
  await db.collection('consent_events').add({
    uid,
    userId: uid,
    email,
    termsVersion: TERMS_VERSION,
    privacyVersion: TERMS_VERSION,
    contentSha256,
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
