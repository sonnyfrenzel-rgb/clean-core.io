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
 */
export function getAuditSigningKey(): string | null {
  const key = process.env.AUDIT_SIGNING_KEY;
  return key && key.length > 0 ? key : null;
}

/** The response body every route returns when the key is absent. */
export const MISSING_SIGNING_KEY_LOG =
  'CRITICAL: AUDIT_SIGNING_KEY is not set. Refusing to sign or verify with a fallback.';
