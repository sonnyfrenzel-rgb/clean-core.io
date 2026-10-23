import { getAdminAuth } from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';

/**
 * The profile picture address Google sends at sign-in, removed from the
 * account's Firebase Authentication record — privacy policy section 2,
 * "Google-Anmeldung", Variante B (owner decision 23.10.2026; G10–G12 of
 * Fassung 1.1).
 *
 * The application never reads, stores or shows the picture: nothing in
 * `app/`, `components/`, `hooks/` or `lib/` touches `photoURL`, no profile
 * field holds it, no log line or mail carries it (T-B, checked 23.10.2026).
 * What remained was Firebase Authentication itself, which keeps the address
 * Google sent in the sign-in record. Data minimisation (Art. 5(1)(c) GDPR)
 * says remove it, so the server clears it right after a Google sign-in — at
 * registration, and for an existing account at its next sign-in.
 *
 * The verified ID token is the only thing looked at: it carries a `picture`
 * claim while the record holds an address. The claim's value is never read,
 * copied or logged; its presence decides whether the record needs clearing.
 * A token minted before the removal still carries the claim for up to an
 * hour, and the call is then simply repeated — clearing an empty field is
 * harmless.
 */

export interface ProfilePictureDeps {
  updateUser(uid: string, props: { photoURL: null }): Promise<unknown>;
}

/** Whether a verified token says the sign-in record still holds a picture address. */
export function tokenCarriesPicture(decoded: { picture?: unknown }): boolean {
  return typeof decoded.picture === 'string' && decoded.picture.length > 0;
}

/**
 * Clears `photoURL` on the account's Auth record when the token says one is
 * there. Best effort: a failure is logged as a code and never fails the
 * request it runs in. Returns whether a removal was made.
 */
export async function removeProfilePictureAddress(
  decoded: { uid: string; picture?: unknown },
  deps?: ProfilePictureDeps,
): Promise<boolean> {
  if (!tokenCarriesPicture(decoded)) return false;
  try {
    const auth = deps ?? (await getAdminAuth());
    await auth.updateUser(decoded.uid, { photoURL: null });
    return true;
  } catch (err) {
    // The error text only — never the token or the record.
    logger.warn('profile picture address not removed', { error: errMessage(err) });
    return false;
  }
}
