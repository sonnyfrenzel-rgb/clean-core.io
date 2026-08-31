import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed one-tap survey links.
 *
 * A token names the campaign and the recipient, and nothing else. The chosen
 * answer travels beside it in the URL rather than inside the signature, because
 * one token per recipient is what makes the follow-up questions on the landing
 * page work: the page already knows who is answering, so Q2 and Q3 are a tap each
 * instead of a login.
 *
 * That is a deliberate trade and worth being explicit about. Anyone holding a
 * recipient's link can submit answers as that recipient — the same property every
 * one-click unsubscribe link in the world has. It is acceptable here because the
 * worst case is a skewed answer in an internal survey, and unacceptable anywhere
 * near the trust chain, which is why this signs with its own domain separator and
 * cannot be confused with an approval token.
 *
 * The secret is `PILOT_APPROVAL_SECRET`, already present in production, CI and the
 * Playwright run. It is the right class of secret — unguessable per-recipient
 * links — and reusing it needs no new configuration. The `cc.survey.v1` prefix is
 * what keeps the two uses apart: a signature made here can never verify there.
 */

const DOMAIN = 'cc.survey.v1';

function getSecret(): string {
  const s = process.env.PILOT_APPROVAL_SECRET;
  if (!s || s.length < 16) {
    // Fail closed. A survey link signed with a guessable key is a survey anyone
    // can fill in on someone else's behalf.
    throw new Error('PILOT_APPROVAL_SECRET is not configured (minimum 16 characters).');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export interface SurveyIdentity {
  campaign: string;
  uid: string;
  /** Milliseconds since the epoch, after which the link stops working. */
  expiresAt: number;
}

export function createSurveyToken(campaign: string, uid: string, expiresAt: number): string {
  const payload = `${DOMAIN}.${campaign}.${uid}.${expiresAt}`;
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${sign(payload)}`;
}

/** Returns the identity, or null for anything malformed, mis-signed or expired. */
export function verifySurveyToken(token: string, now: number = Date.now()): SurveyIdentity | null {
  const parts = (token || '').split('.');
  if (parts.length !== 2) return null;

  const [b64, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = sign(payload);
  // Compare as bytes of equal length, or timingSafeEqual throws rather than
  // returning false — which would turn a malformed token into a 500.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) return null;

  const fields = payload.split('.');
  // `cc`, `survey`, `v1`, campaign, uid, expiry — the domain itself contains dots.
  if (fields.length !== 6) return null;
  const [d1, d2, d3, campaign, uid, expRaw] = fields;
  if (`${d1}.${d2}.${d3}` !== DOMAIN) return null;

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || now > expiresAt) return null;
  if (!campaign || !uid) return null;

  return { campaign, uid, expiresAt };
}
