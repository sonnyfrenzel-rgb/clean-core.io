import { APP_BASE_URL } from '@/lib/constants';
import { createUnsubscribeToken } from '@/lib/unsubscribe-token';
import { accountHashOf, pseudonymPepperConfigured } from '@/lib/pseudonym';

/**
 * The suppression list for invitations — one list for project invitations
 * (C10) and portfolio invitations (C12); privacy policy sections 5, 6 and 8.
 *
 * An invitation mail carries an unsubscribe link. Whoever uses it puts the
 * address on this list — only as the keyed hash (HMAC-SHA256 under
 * `PSEUDONYM_PEPPER`, the same key as every other pseudonym), never the
 * address — and no invitation of either kind goes to it again. The list is
 * kept without end, also beyond an account erasure, because an opt-out that
 * lapses is not honoured (privacy policy section 5).
 *
 *   invitation_suppressions/{keyed hash}
 *     list: 'invitations', keyed: true, source, unsubscribedAt
 *
 * Its own collection, apart from `email_suppressions` (community mail): the
 * two are withdrawn and lifted differently — switching community mail back on
 * lifts that entry, nothing an inviter does lifts this one — and one document
 * id per address could not hold both. Server-only, Admin SDK; `firestore.rules`
 * opens no path to it (default deny).
 *
 * Without the pepper no keyed hash can be made, so nothing can have been
 * stored either: the check then answers "not suppressed", and the
 * unsubscribe route answers that the opt-out could not be stored.
 */

export const INVITATION_SUPPRESSIONS = 'invitation_suppressions';

/** The code an invitation route answers with when the address unsubscribed. */
export const INVITATION_SUPPRESSED_CODE = 'invitation-suppressed';

/** The sentence the inviter reads. It says what happens, not why. */
export const INVITATION_SUPPRESSED_MESSAGE =
  'No invitation can be sent to this address: its holder has asked Clean-Core.io not to send them invitations.';

interface SuppressionDb {
  collection(name: string): { doc(id: string): { get(): Promise<{ exists: boolean }> } };
}

/** The document id for an address, or null without the pepper. */
export function invitationSuppressionKey(email: string, env: Record<string, string | undefined> = process.env): string | null {
  return pseudonymPepperConfigured(env) ? accountHashOf(email, env) : null;
}

/** Whether the address has unsubscribed from invitations. */
export async function isInvitationSuppressed(
  db: SuppressionDb,
  email: string,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const key = invitationSuppressionKey(email, env);
  if (!key) return false;
  return (await db.collection(INVITATION_SUPPRESSIONS).doc(key).get()).exists;
}

/**
 * The visible unsubscribe link of an invitation mail. The token travels in the
 * fragment, which the browser never sends to a server, as for community mail
 * (`app/unsubscribe`).
 */
export function invitationUnsubscribeUrl(email: string): string {
  return `${APP_BASE_URL}/unsubscribe/invitations#t=${encodeURIComponent(createUnsubscribeToken(email, undefined, 'inv-unsub'))}`;
}
