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
 * Firestore document the owner could, because the rules never saw the cookie.
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
 * The enrolment requirement for S/4HANA access (Sonny, 18.09.2026: "mandatory
 * MFA for S/4 access, yes").
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
 * (Sonny, 18.09.2026: "mandatory MFA only for an own Gemini key, the rest
 * stays optional"). A stolen first-factor token could otherwise replace the key
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

export const OWN_KEY_BLOCKS_MFA_REMOVAL: GateRefusal = {
  status: 409,
  message:
    'Your own model key is stored on this account, and it may only be kept with multi-factor authentication. Remove the key under Settings first, then turn off the authenticator.',
};

/**
 * An own model key is held only with the second factor (`byokRequiresEnrolment`), and removing the key needs the
 * factor too. Turning the factor off while a key is stored would leave a key that is used on every call and that
 * the account could no longer remove — so the factor goes only after the key.
 */
export function mfaRemovalBlockedByOwnKey(profile: { byokConfigured?: unknown } | null | undefined): GateRefusal | null {
  return profile?.byokConfigured === true ? OWN_KEY_BLOCKS_MFA_REMOVAL : null;
}

/**
 * The profile field POST /api/mfa/disable sets, in a transaction that also checks for a stored own key, before it
 * removes the factor from Firebase Auth (`reserveFactorRemoval` in `lib/mfa-disable.ts`). Written through the Admin
 * SDK only; the client update allowlist in firestore.rules does not name it. The key save reads it in its own
 * transaction on the same profile, so the two serialise: either the key is stored first and the removal is refused,
 * or the removal is reserved first and the save is refused. A milliseconds timestamp.
 */
export const MFA_REMOVAL_MARKER = 'mfaRemovalStartedAt';

/** How long a reservation holds when the call that set it never finished (a crash between the two systems). */
export const MFA_REMOVAL_MARKER_TTL_MS = 15 * 60 * 1000;

export const OWN_KEY_SAVE_DURING_MFA_REMOVAL: GateRefusal = {
  status: 409,
  message:
    'The authenticator on this account is being turned off, and an own model key may only be kept with multi-factor authentication. Set the authenticator up again, then store the key.',
};

export const MFA_REMOVAL_ALREADY_RUNNING: GateRefusal = {
  status: 409,
  message: 'The authenticator on this account is already being turned off. Wait a moment and reload the page.',
};

/**
 * The reservation as stored: when it was taken and the token of the request that holds it. Only that request may
 * lift it (`releaseFactorRemoval`), so a second, failing request cannot lift the first one's while it still runs.
 * A bare number is read as a reservation without a token, as the first form of the field was written.
 */
export interface MfaRemovalReservation {
  at: number;
  token: string;
}

export function mfaRemovalReservationOf(profile: Record<string, unknown> | null | undefined): MfaRemovalReservation | null {
  const v = profile?.[MFA_REMOVAL_MARKER];
  if (typeof v === 'number' && Number.isFinite(v)) return { at: v, token: '' };
  if (v && typeof v === 'object') {
    const { at, token } = v as { at?: unknown; token?: unknown };
    if (typeof at === 'number' && Number.isFinite(at)) return { at, token: typeof token === 'string' ? token : '' };
  }
  return null;
}

/** Whether the profile carries a removal reservation that has not run out. */
export function mfaRemovalInProgress(profile: Record<string, unknown> | null | undefined, nowMs: number): boolean {
  const r = mfaRemovalReservationOf(profile);
  return r !== null && nowMs - r.at < MFA_REMOVAL_MARKER_TTL_MS;
}

/**
 * The decision the own-key save takes inside its transaction, on the profile it read there and the factors Firebase
 * Auth reported there: no key while the factor is being removed, and none without the flag and a factor.
 * `'unchecked'` is the Firebase emulator, which cannot enrol a factor (the same exemption `assertMfaSatisfied` makes).
 */
export function ownKeySaveRefusal(
  profile: Record<string, unknown> | null | undefined,
  factorEnrolled: boolean | 'unchecked',
  nowMs: number,
): GateRefusal | null {
  if (mfaRemovalInProgress(profile, nowMs)) return OWN_KEY_SAVE_DURING_MFA_REMOVAL;
  if (factorEnrolled === 'unchecked') return null;
  return profile?.mfaEnabled === true && factorEnrolled ? null : BYOK_MFA_ENROLMENT_REQUIRED;
}
