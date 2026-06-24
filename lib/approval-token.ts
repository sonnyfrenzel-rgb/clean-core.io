import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Centralised approval-token logic (audit P2).
 *
 * Replaces the previous `HMAC(secret, uid)` scheme. Tokens are now bound to
 * uid + requestType + action and carry an expiry. Verification is timing-safe
 * and FAIL-CLOSED — there is no hardcoded fallback secret.
 *
 * Remaining hardening (documented follow-up): one-time use / nonce invalidation
 * requires a server-side store (e.g. a `jti` field on the request document that
 * is checked and cleared on approval). Not included here to avoid a half-correct
 * implementation; see GUIDANCE.md.
 */

export type RequestType = 'pilot' | 'tenant';
export type ApprovalAction = 'approve' | 'reject';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const s = process.env.PILOT_APPROVAL_SECRET;
  if (!s || s.length < 16) {
    // Never fall back to a hardcoded secret — fail closed.
    throw new Error('PILOT_APPROVAL_SECRET is not configured (minimum 16 characters).');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Create a token bound to uid + requestType + action, valid for `ttlMs`. */
export function createApprovalToken(
  uid: string,
  requestType: RequestType,
  action: ApprovalAction,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const exp = Date.now() + ttlMs;
  const payload = `${uid}.${requestType}.${action}.${exp}`;
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${sign(payload)}`;
}

/** Verify a token against the expected uid/requestType/action. Throws on any mismatch or expiry. */
export function verifyApprovalToken(
  token: string,
  expected: { uid: string; requestType: RequestType; action: ApprovalAction },
): void {
  const parts = (token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid verification token: Malformed approval token.');

  const [b64, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid verification token: Malformed approval token.');
  }

  const expectedSig = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid verification token: Invalid approval token signature.');
  }

  const [uid, requestType, action, expStr] = payload.split('.');
  const exp = Number(expStr);
  if (uid !== expected.uid || requestType !== expected.requestType || action !== expected.action) {
    throw new Error('Invalid verification token: Approval token does not match the requested action.');
  }
  if (!Number.isFinite(exp) || Date.now() > exp) {
    throw new Error('Invalid verification token: Approval token has expired.');
  }
}
