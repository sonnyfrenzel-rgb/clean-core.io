import { APP_BASE_URL } from '@/lib/constants';
import { safeReturnPath } from '@/lib/return-path';

/**
 * The address-confirmation link on the product's own domain (roadmap 3.0.9).
 *
 * Firebase Admin's `generateEmailVerificationLink` points at the project's
 * default handler, `https://<project>.firebaseapp.com/__/auth/action?...`. A mail
 * from clean-core.io whose one button leads to a different, generic-looking
 * domain is exactly the mismatch filters and cautious readers treat as phishing;
 * the seed run 20260924-a delivered this mail to no inbox except Gmail.
 *
 * Only the one-time `oobCode` is taken over. The page at `/auth/action` redeems it
 * in the browser with the Firebase client SDK (`applyActionCode`), which already
 * knows the project and its API key — so neither travels in the mail.
 *
 * Throws when the Firebase link is not a verify-email link with a code, so a
 * changed upstream format fails the send instead of mailing a dead link.
 */
export const AUTH_ACTION_PATH = '/auth/action';

export function ownDomainVerifyEmailLink(firebaseLink: string, baseUrl: string = APP_BASE_URL): string {
  let parsed: URL;
  try {
    parsed = new URL(firebaseLink);
  } catch {
    throw new Error('the verification link from Firebase is not a URL');
  }
  const mode = parsed.searchParams.get('mode');
  const oobCode = parsed.searchParams.get('oobCode');
  if (mode !== 'verifyEmail') throw new Error('the Firebase link is not a verify-email link');
  if (!oobCode || !/^[A-Za-z0-9_-]{8,2048}$/.test(oobCode)) throw new Error('the Firebase link carries no usable oobCode');
  const q = new URLSearchParams({ mode: 'verifyEmail', oobCode });
  return `${baseUrl.replace(/\/+$/, '')}${AUTH_ACTION_PATH}?${q.toString()}`;
}

/**
 * The confirmation link with the page to return to once the address is
 * confirmed — roadmap 3.0.21 (4). The invitation mail promises "the link brings
 * you back here afterwards", and the confirmation used to end with "open the
 * invitation link from the other email". The path rides along as `next`, and
 * only a path `safeReturnPath` accepts does: anything else leaves the link as it
 * was, and the confirmation page checks it again on the way out.
 */
export function withReturnPath(confirmationLink: string, next: string): string {
  const target = safeReturnPath(next);
  if (!target) return confirmationLink;
  const url = new URL(confirmationLink);
  url.searchParams.set('next', target);
  return url.toString();
}
