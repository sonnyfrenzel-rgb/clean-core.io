/**
 * What a paste into the second-factor screen of the sign-in is.
 *
 * Recovery codes used to look like `CC-XXXX-YYYY`, and people kept them.
 * Roadmap 0.13 replaced the application-level TOTP with Firebase's own factor,
 * and those backup codes no longer exist. Someone pasting an old one got "that
 * code is not valid" and no idea why (UX review of 52f171091948,
 * d5f35cf138c5). It is not invalid — it no longer exists, and the way back in
 * is a different one.
 *
 * Pure, so the decision is tested by calling it rather than by reading the
 * component that uses it (carried QA finding 108f6c87b29f).
 */

const OLD_RECOVERY_CODE = /^CC-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export const OLD_RECOVERY_CODE_MESSAGE =
  'That is one of the old recovery codes, which no longer exist. Sign in with the 6-digit code from your authenticator app, or write to info@clean-core.io from your account address if you have lost it.';

export type MfaPaste =
  | { kind: 'old-recovery-code'; message: string }
  | { kind: 'totp'; code: string }
  | { kind: 'ignore' };

export function classifyMfaPaste(raw: string): MfaPaste {
  const text = raw.trim();
  if (OLD_RECOVERY_CODE.test(text)) return { kind: 'old-recovery-code', message: OLD_RECOVERY_CODE_MESSAGE };
  if (text.length === 6 && !isNaN(Number(text))) return { kind: 'totp', code: text };
  return { kind: 'ignore' };
}
