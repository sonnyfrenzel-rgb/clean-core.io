/**
 * The second-factor decision, as a pure function of the profile and the token.
 *
 * Roadmap 0.13 (Sonny, 16.09.2026, "Variante 2"): the second factor is
 * Firebase's own TOTP multi-factor, and the proof is the ID token. Firebase
 * issues no token before the factor is resolved, and the token it then issues
 * names the factor in `firebase.sign_in_second_factor` — so the gate is a field
 * on the token, not a cookie. `lib/firebase-admin.ts` reads the profile and
 * throws; this module decides, so the decision can be tested without the
 * Admin SDK (whose auth module does not load under Playwright's CommonJS
 * transform).
 *
 * What it replaced: an application-level TOTP whose prompt was a React state
 * change after the password had already produced a valid session, backed by an
 * `mfa_session` cookie. A stolen ID token from such an account could read every
 * Firestore document the owner could, because the rules never saw the cookie
 * (QA full review of 33471220d6e9, cfafefac08ec).
 */

export interface SecondFactorToken {
  auth_time?: unknown;
  /** The token's `firebase` claim block; only `sign_in_second_factor` is read, the rest is Firebase's. */
  firebase?: { sign_in_second_factor?: unknown; [claim: string]: unknown } | null;
}

export interface GateRefusal {
  status: number;
  message: string;
}

/** True when the ID token was issued after a second factor. */
export function hasSecondFactor(decodedToken: SecondFactorToken | null | undefined): boolean {
  const factor = decodedToken?.firebase?.sign_in_second_factor;
  return typeof factor === 'string' && factor.length > 0;
}

export const MFA_REQUIRED: GateRefusal = {
  status: 403,
  message: 'Multi-factor authentication required. Sign in again with your authenticator code.',
};

export const MFA_STEP_UP_STALE: GateRefusal = {
  status: 403,
  message: 'MFA security timeout. Sign in again with your authenticator code and retry.',
};

/**
 * The plain gate: an account that requires the factor passes only with a
 * token that carries it. An account without the requirement passes with any
 * token; so does an account without a profile — that is not this gate's call.
 */
export function mfaSatisfied(mfaEnabled: boolean, decodedToken: SecondFactorToken): GateRefusal | null {
  if (!mfaEnabled) return null;
  return hasSecondFactor(decodedToken) ? null : MFA_REQUIRED;
}

/**
 * The step-up for sensitive actions: the factor on the token, and the
 * sign-in that produced the token within `maxAgeSeconds`. Re-authenticating an
 * enrolled account runs the factor again, so both facts arrive on one token.
 */
export function mfaSteppedUp(mfaEnabled: boolean, decodedToken: SecondFactorToken, nowSeconds: number, maxAgeSeconds = 300): GateRefusal | null {
  if (!mfaEnabled) return null;
  if (!hasSecondFactor(decodedToken)) return MFA_REQUIRED;
  const authTime = Number(decodedToken.auth_time);
  if (!Number.isFinite(authTime) || nowSeconds - authTime > maxAgeSeconds) return MFA_STEP_UP_STALE;
  return null;
}

export const S4_MFA_ENROLMENT_REQUIRED: GateRefusal = {
  status: 403,
  message:
    'Access to a live S/4HANA tenant requires multi-factor authentication on this account. Enable it under Settings, sign in again with your authenticator code, and retry.',
};

/**
 * The enrolment requirement for S/4HANA access (Sonny, 18.09.2026: "MFA-Zwang
 * für S/4-Zugang, ja").
 *
 * `mfaSatisfied` above is a *conditional* gate: an account that never enrolled
 * passes it with any token, because there is no factor to ask for. That is
 * the right shape for optional MFA and the wrong one for the routes that talk
 * to somebody else's production system with stored credentials. Two security
 * audits (bc2f786, def8262) described it accurately - "a stolen ID token is
 * enough" for an un-enrolled account - and the answer is not a bug fix but a
 * decision, which is why it has its own function rather than a change to
 * `mfaSatisfied`: the routes that keep optional MFA keep calling that one.
 *
 * Order of the two questions on an S/4 route: first this (is a factor
 * enrolled at all?), then `mfaSatisfied` (is it on this token?). An account
 * that fails here is told what to do; an account that passes here and fails
 * there is told to sign in again. The admin claim does not exempt anybody -
 * an administrator reaching a tenant is reaching a tenant.
 */
export function s4AccessRequiresEnrolment(mfaEnabled: boolean): GateRefusal | null {
  return mfaEnabled ? null : S4_MFA_ENROLMENT_REQUIRED;
}

export const BYOK_MFA_ENROLMENT_REQUIRED: GateRefusal = {
  status: 403,
  message:
    'Storing, testing or removing your own Gemini API key requires multi-factor authentication on this account. Enable it under Settings, sign in again with your authenticator code, and retry.',
};

/**
 * The same requirement for the routes that hold a person's own model key
 * (Sonny, 18.09.2026: "MFA-Zwang nur bei Gemini eigenen Schlüssel, Rest bleibt
 * optional"). A stolen first-factor token could otherwise replace the key
 * with one the attacker controls - and every transformation would then run
 * against it. Measured before shipping: no production account held a key,
 * so the requirement locks nobody out today.
 *
 * Everything else - minting runs, signing packs, the Jira start - keeps the
 * conditional gate on purpose: requiring the factor on `runs/create` would
 * stop every un-enrolled account from analysing at all.
 */
export function byokRequiresEnrolment(mfaEnabled: boolean): GateRefusal | null {
  return mfaEnabled ? null : BYOK_MFA_ENROLMENT_REQUIRED;
}
