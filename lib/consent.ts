import { getAdminDb } from '@/lib/firebase-admin';
import { TERMS_VERSION } from '@/lib/constants';
import { archivedTermsSha256For, isTermsLanguage, type TermsLanguage } from '@/lib/terms-versions';
import { PROOF_LOG_RETENTION } from '@/lib/proof-log';

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

/** The account has no profile — erased, or never registered. Nothing was written. */
export class ConsentProfileMissingError extends Error {
  readonly code = 'profile-missing';
  constructor() {
    super('There is no account profile to record this consent for.');
    this.name = 'ConsentProfileMissingError';
  }
}

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
  /**
   * The language version of the Terms the person ticked and accepted (section
   * 1.4 of Terms v2.3.0; acceptance test T02) — German or English. Not the interface
   * locale: the dialog lets the reader choose the contract language, and that
   * choice is what governs. Anything else records English, the only version
   * the dialogs offered before Terms v2.3.0.
   */
  termsLanguage?: unknown;
}

/** The language version an acceptance request names, or English. */
export function acceptedTermsLanguageOf(value: unknown): TermsLanguage {
  return isTermsLanguage(value) ? value : 'en';
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

/** What a recorded acceptance returns: what the record says, for the confirmation mail. */
export interface RecordedConsent {
  termsVersion: string;
  termsLanguage: TermsLanguage;
  /** SHA-256 of the archived wording of that language version, or null. */
  digest: string | null;
}

/** The two Firestore calls a consent makes — what a spec stands in for. */
interface ConsentBatch {
  create(ref: unknown, data: Record<string, unknown>): unknown;
  update(ref: unknown, data: Record<string, unknown>): unknown;
  commit(): Promise<unknown>;
}
export interface ConsentDeps {
  db: { batch(): ConsentBatch; collection(name: string): { doc(id?: string): unknown } };
  FieldValue: { serverTimestamp(): unknown };
}

/**
 * `deps` exists so a spec can watch the writes without a database; callers
 * pass the input alone.
 */
export async function recordConsent(
  { uid, email, source, locale, termsLanguage }: RecordConsentInput,
  deps?: ConsentDeps,
): Promise<RecordedConsent> {
  const { db, FieldValue } = deps ?? (await getAdminDb());

  // T02: the language version accepted, and the digest of exactly that
  // version's archived wording — the German file for a German acceptance,
  // never the English digest for it. Null while that language version has no
  // archived text — see the note above on why null and not a stand-in.
  const language = acceptedTermsLanguageOf(termsLanguage);
  const contentSha256 = archivedTermsSha256For(TERMS_VERSION, language);

  // One batch, so the record and the state enforcement reads commit together
  // or not at all. Two awaited writes could leave an acceptance on record that
  // the profile never saw — enforcement still demanding the old version — and a
  // retry then appended a second event for one acceptance.
  const batch = db.batch();

  // 1) append-only consent event (primary, tamper-evident record; userId lets the
  //    erasure cascade purge it on account deletion).
  batch.create(db.collection('consent_events').doc(), {
    uid,
    userId: uid,
    email,
    kind: 'accepted',
    termsVersion: TERMS_VERSION,
    privacyVersion: TERMS_VERSION,
    termsLanguage: language,
    contentSha256,
    locale: typeof locale === 'string' ? locale.slice(0, 35) : null,
    source,
    createdAt: FieldValue.serverTimestamp(),
    // The proof log (T05/T06): the record's own deletion date. Unknown while
    // the contract runs — it is set, with the keyed hash in place of the
    // address, when the contract ends (`lib/proof-log.ts`).
    retention: PROOF_LOG_RETENTION,
    expiresAt: null,
  });

  // 2) mirror the accepted version onto the profile (server timestamp).
  //
  // An update, not a merge (L-01): it fails when the profile does not exist,
  // and the batch with it, so the event above is not written either. An ID
  // token stays valid for up to an hour after the account it names was erased,
  // and a merge onto a missing document recreates it — a consent recorded with
  // such a token brought a deleted account's profile back. A consent belongs to
  // an account that exists.
  batch.update(db.collection('users').doc(uid), {
    termsVersionAccepted: TERMS_VERSION,
    termsLanguageAccepted: language,
    termsAcceptedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err: unknown) {
    // gRPC NOT_FOUND: the profile is gone. Named, so a caller can say so.
    if ((err as { code?: unknown } | null)?.code === 5) throw new ConsentProfileMissingError();
    throw err;
  }

  return { termsVersion: TERMS_VERSION, termsLanguage: language, digest: contentSha256 };
}
