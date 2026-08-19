import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed unsubscribe links for bulk mail.
 *
 * Gmail and Yahoo require bulk senders to offer one-click unsubscribe
 * (RFC 8058): a `List-Unsubscribe` URL that honours an unauthenticated POST
 * within two days. The link therefore cannot require a login, which means the
 * token itself has to carry the identity and be unforgeable.
 *
 * Same construction as `lib/approval-token.ts` — HMAC-SHA256 over a base64url
 * payload, timing-safe comparison, fail-closed on a missing secret — with the
 * literal purpose `unsub` inside the signed payload. That domain separation is
 * what makes it safe to share `PILOT_APPROVAL_SECRET` with the approval tokens:
 * a token minted for one purpose can never verify for the other, and no new
 * deployment secret has to be provisioned.
 *
 * The TTL is deliberately long. An unsubscribe link that has expired is worse
 * than useless — the recipient clicks it, nothing happens, and they press the
 * spam button instead, which is exactly the outcome the header exists to prevent.
 */

/** Two years. Long enough that a link in an archived mail still works. */
const DEFAULT_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const PURPOSE = 'unsub';

function getSecret(): string {
  const s = process.env.PILOT_APPROVAL_SECRET;
  if (!s || s.length < 16) {
    throw new Error('PILOT_APPROVAL_SECRET is not configured (minimum 16 characters).');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Normalised form used for both signing and the suppression key. */
export function normaliseEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

/** Create an unsubscribe token bound to one email address. */
export function createUnsubscribeToken(email: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const exp = Date.now() + ttlMs;
  const payload = `${PURPOSE}.${normaliseEmail(email)}.${exp}`;
  const b64 = Buffer.from(payload).toString('base64url');
  return `${b64}.${sign(payload)}`;
}

/**
 * Verify a token and return the address it was issued for.
 * Throws on a malformed token, a bad signature, the wrong purpose, or expiry.
 */
export function verifyUnsubscribeToken(token: string): string {
  const parts = (token || '').split('.');
  if (parts.length !== 2) throw new Error('Malformed unsubscribe link.');

  const [b64, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    throw new Error('Malformed unsubscribe link.');
  }

  const expected = sign(payload);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid unsubscribe link.');
  }

  // Parsed from the ends, not by splitting: the address sits in the middle and
  // almost always contains dots of its own (`name@example.co.uk`), so a naive
  // split produces the wrong number of segments for most real recipients.
  const firstDot = payload.indexOf('.');
  const lastDot = payload.lastIndexOf('.');
  if (firstDot < 0 || lastDot <= firstDot) throw new Error('Malformed unsubscribe link.');

  const purpose = payload.slice(0, firstDot);
  const email = payload.slice(firstDot + 1, lastDot);
  const expRaw = payload.slice(lastDot + 1);

  if (purpose !== PURPOSE) throw new Error('Invalid unsubscribe link.');

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    throw new Error('This unsubscribe link has expired. Please write to info@clean-core.io.');
  }

  if (!email) throw new Error('Malformed unsubscribe link.');
  return email;
}
