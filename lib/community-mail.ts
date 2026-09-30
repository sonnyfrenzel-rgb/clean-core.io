import { isTestAccount } from './test-accounts';

/**
 * Community mail — survey invitations and community updates — goes only to an
 * account that opted in (owner decision of 30.09.2026, QA finding bef96e7f054f).
 *
 * The privacy policy used to say there is no newsletter and no marketing mail
 * while surveys were being sent to every account. The decision was consent, not
 * a different sentence: the account settings carry a switch, off by default,
 * and every sender asks this module before it mails anyone.
 *
 * The consent lives on the profile as `users/{uid}.communityMail`, written only
 * by the server (`POST /api/community-mail` for the switch,
 * `POST /api/unsubscribe` for a withdrawal from a mail). It is not in
 * `userClientUpdateKeys()` of `firestore.rules`, so a browser cannot set it and
 * no rules deploy was needed. It goes with the profile when the account is
 * erased.
 *
 * Pure, with no Firebase import: the settings card reads the type, and
 * `scripts/send-survey.ts` and `tests/community-mail-consent.spec.ts` call the
 * gate without a server.
 */

/** The profile field. One name, so senders, routes and tests cannot drift apart. */
export const COMMUNITY_MAIL_FIELD = 'communityMail';

/** Where the last change came from. */
export type CommunityMailSource = 'settings' | 'unsubscribe';

export interface CommunityMailConsent {
  /** True only after the account switched it on. Absent or anything else means no. */
  optIn: boolean;
  /** Server time of the latest opt-in. Kept when the consent is withdrawn. */
  consentedAt?: unknown;
  /** Server time of the latest withdrawal. Kept when the account opts in again. */
  withdrawnAt?: unknown;
  source?: CommunityMailSource;
}

/**
 * Strictly `true`. A missing field, `"true"`, `1`, a profile written before the
 * switch existed — every one of them is no. Consent is never inferred.
 */
export function hasCommunityMailOptIn(profile: unknown): boolean {
  if (typeof profile !== 'object' || profile === null) return false;
  const consent = Reflect.get(profile, COMMUNITY_MAIL_FIELD);
  if (typeof consent !== 'object' || consent === null) return false;
  return Reflect.get(consent, 'optIn') === true;
}

/** Why an account does not receive community mail, or `null` when it may. */
export type CommunityMailBlock = 'noEmail' | 'testAccount' | 'deleted' | 'noOptIn' | 'suppressed';

/**
 * The one gate every community sender calls, per account.
 *
 * The order is the order of the old survey filter, with the consent check
 * added before the suppression list: an address on the list has unsubscribed,
 * and an account without the flag never asked — both are a no, and the reason
 * is counted separately so a dry run says which.
 *
 * `suppressed` holds normalised addresses (`lib/unsubscribe-token.ts`
 * `normaliseEmail`). The suppression list still counts even for an account
 * that has the flag: a withdrawal whose profile update failed must not be
 * undone by a stale flag.
 */
export function communityMailBlock(
  profile: { email?: unknown; status?: unknown; disabled?: unknown } & Record<string, unknown>,
  suppressed: ReadonlySet<string>,
): CommunityMailBlock | null {
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
  if (!email) return 'noEmail';
  if (isTestAccount(email)) return 'testAccount';
  if (profile.status === 'deleted' || profile.disabled === true) return 'deleted';
  if (!hasCommunityMailOptIn(profile)) return 'noOptIn';
  if (suppressed.has(email)) return 'suppressed';
  return null;
}

/**
 * The two unsubscribe URLs a community mail carries.
 *
 * - `oneClick` goes into the RFC 8058 `List-Unsubscribe` header. Mail providers
 *   POST to it with no body, so the token has to be in the query. That is the
 *   accepted residual risk of QA finding 8e25777f1339: the URL can reach a
 *   request log, and the token in it can only unsubscribe.
 * - `page` is the visible link in the body. The token sits in the fragment,
 *   which a browser never sends to the server, so a click leaves no token in
 *   the Cloud Run request log. `/unsubscribe` reads it in the browser and POSTs
 *   it in the body.
 */
export function unsubscribeUrls(baseUrl: string, token: string): { oneClick: string; page: string } {
  const base = baseUrl.replace(/\/+$/, '');
  const t = encodeURIComponent(token);
  return { oneClick: `${base}/api/unsubscribe?t=${t}`, page: `${base}/unsubscribe#t=${t}` };
}
