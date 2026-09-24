import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Centralised approval-token logic (audit P2).
 *
 * Replaces the previous `HMAC(secret, uid)` scheme. Tokens are now bound to
 * uid + requestType + action and carry an expiry. Verification is timing-safe
 * and FAIL-CLOSED — there is no hardcoded fallback secret.
 *
 * One-time use (UX-152, Sonny 24.09.2026): a token may carry a nonce. The nonce
 * is stored server-side when the links are minted and consumed — in one
 * transaction, by whichever of the two links is used first — in
 * `approveTenantWithToken` (lib/firebase-admin.ts). It cannot live on the
 * request document: the requester's own browser writes that one.
 */

export type RequestType = 'pilot' | 'tenant';
export type ApprovalAction = 'approve' | 'reject';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** What a nonce looks like: 16–64 lowercase hex characters. Nothing else is signed into that slot. */
const NONCE = /^[a-f0-9]{16,64}$/;

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

/** Create a token bound to uid + requestType + action (+ nonce, when given), valid for `ttlMs`. */
export function createApprovalToken(
  uid: string,
  requestType: RequestType,
  action: ApprovalAction,
  ttlMs: number = DEFAULT_TTL_MS,
  nonce?: string,
): string {
  if (nonce !== undefined && !NONCE.test(nonce)) {
    throw new Error('An approval nonce is 16 to 64 lowercase hex characters.');
  }
  const exp = Date.now() + ttlMs;
  const payload = nonce ? `${uid}.${requestType}.${action}.${exp}.${nonce}` : `${uid}.${requestType}.${action}.${exp}`;
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${sign(payload)}`;
}

/**
 * Verify a token against the expected uid/requestType/action. Throws on any
 * mismatch or expiry. Returns the nonce the token carries, or null — whether a
 * nonce is required is the caller's decision, because only the caller holds the
 * store it is checked against.
 */
export function verifyApprovalToken(
  token: string,
  expected: { uid: string; requestType: RequestType; action: ApprovalAction },
): { nonce: string | null } {
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

  const [uid, requestType, action, expStr, nonce] = payload.split('.');
  const exp = Number(expStr);
  if (uid !== expected.uid || requestType !== expected.requestType || action !== expected.action) {
    throw new Error('Invalid verification token: Approval token does not match the requested action.');
  }
  if (!Number.isFinite(exp) || Date.now() > exp) {
    throw new Error('Invalid verification token: Approval token has expired.');
  }
  return { nonce: nonce !== undefined && NONCE.test(nonce) ? nonce : null };
}
