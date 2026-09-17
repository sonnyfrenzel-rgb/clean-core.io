/**
 * The one key every run signature and every audit pack is bound to.
 *
 * What stood in four places across three route handlers was
 * `process.env.AUDIT_SIGNING_KEY` with `||` and a constant fallback after it — a
 * key committed to a public repository. The guard around it asked for
 * `NODE_ENV === 'production' && !emulator` before refusing to run without a real
 * key, so anything that failed either half of that test signed with a string the
 * whole internet can read. `/api/export/verify` used the same fallback, and would
 * therefore certify a pack forged with it as genuine. The trust chain is the
 * product's entire claim; a key anyone can look up is not a key.
 *
 * There is no fallback now. Every environment supplies `AUDIT_SIGNING_KEY` or the
 * routes that need it fail closed — production, preview, CI and a laptop alike.
 * `playwright.config.ts` supplies a throwaway value for the test run, the deploy
 * pipeline asserts the secret exists before it deploys, and local development
 * needs one line in `.env.local`.
 *
 * `tests/signing-key-guard.spec.ts` fails the suite if the old constant, or any
 * `AUDIT_SIGNING_KEY || '…'` fallback, comes back.
 *
 * There is a floor under it as well. "Set" used to mean `length > 0`, so a
 * one-character placeholder — the kind that gets typed into a secret field to
 * see whether a deploy goes through — was a valid signing key for the whole
 * trust chain. HMAC-SHA256 is only as strong as its key: anyone holding one
 * genuine pack can try candidate keys offline against its manifest hash until
 * the signature matches, and a short key is found in seconds. Every forgery
 * made with the recovered key then verifies as genuine, which is the one
 * claim this product makes about itself. A minimum is a startup condition, not
 * a runtime branch: the key is either strong enough to sign with or the
 * signing and verifying routes answer 500, exactly as they do when it is
 * missing (QA full review of a19945ef01dc, d67ef0b953f0 / 7ce412f6a068).
 *
 * The same floor is checked before a production deploy in
 * `.github/workflows/deploy.yml`, so a weak secret is refused where it can
 * still be fixed instead of taking every export route down after the rollout.
 */

/**
 * The shortest key the trust chain will sign with — 32 characters, the width
 * of the SHA-256 output it keys, and the same order of magnitude as the
 * 16-character minimum `lib/approval-token.ts` has held for its HMAC since the
 * P2 audit.
 */
export const MIN_SIGNING_KEY_LENGTH = 32;

export function getAuditSigningKey(): string | null {
  const key = process.env.AUDIT_SIGNING_KEY;
  return key && key.length >= MIN_SIGNING_KEY_LENGTH ? key : null;
}

/** The response body every route returns when the key is absent or too weak. */
export const MISSING_SIGNING_KEY_LOG =
  `CRITICAL: AUDIT_SIGNING_KEY is not set, or is shorter than the ${MIN_SIGNING_KEY_LENGTH}-character minimum. ` +
  'Refusing to sign or verify with a fallback or with a brute-forceable key.';
