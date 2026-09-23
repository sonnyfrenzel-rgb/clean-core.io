import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAdminDb, QuotaError } from '@/lib/firebase-admin';

// F-10: pepper used to pseudonymise the composite key into an opaque doc ID so the
// rate_limits collection holds no durable PII (was `gemini:<uid>:<ip>` in cleartext).
//
// It had a third branch — the string literal `'rate-limit-dev-pepper'` — and a
// literal in the source is not a pepper: anyone reading this public repository
// could recompute every document ID and turn the collection back into
// `gemini:<uid>:<ip>`, which is the one thing F-10 was for (security audit of
// b88c77b, SEC-b88c77b-132, read at the line on 22.09.2026). It is gone. A
// deployment that sets neither variable now fails loudly on the first limited
// request instead of pseudonymising with a public value, which is the same
// no-fallback rule `lib/audit-signing-key.ts` already follows.
//
// It had a second branch too, `AUDIT_SIGNING_KEY`, because that is what
// production actually used: `RATE_LIMIT_PEPPER` existed in no env_vars line of
// `.github/workflows/deploy.yml`, and removing the branch before the dedicated
// secret existed would have taken rate limiting off production. Sonny created
// the repository secret on 23.09.2026 and the same commit passes it to Cloud
// Run, so the branch went with it. One secret for two purposes was hygiene
// rather than a hole — but the audit signing key signs what an outsider is
// invited to verify, and a second reader of it is a second way for it to end up
// somewhere it should not be.
//
// Resolved per call, not at module load: throwing while the module is imported
// would take down every route that merely imports it, including the ones that
// never reach a limited path.
function rateLimitPepper(): string {
  const pepper = process.env.RATE_LIMIT_PEPPER;
  if (!pepper) {
    throw new Error(
      'RATE_LIMIT_PEPPER is not set — the rate limiter refuses to pseudonymise with a known value.',
    );
  }
  return pepper;
}

function rateLimitDocId(key: string): string {
  return crypto.createHmac('sha256', rateLimitPepper()).update(key).digest('hex');
}

/**
 * Server-side rate limiter backed by Firestore rate_limits collection.
 * Each key gets a sliding window of `maxRequests` within `windowMs`.
 *
 * @param key   Composite key, e.g. `gemini:<uid>:<ip>`
 * @param maxRequests  Maximum allowed requests in the window
 * @param windowMs     Window size in milliseconds
 */
export async function assertRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<void> {
  // Skip rate limiting in emulator/test mode
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') return;

  const { db, FieldValue } = await getAdminDb();
  const ref = db.collection('rate_limits').doc(rateLimitDocId(key));

  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const windowStart = now - windowMs;
    // F-10: expiresAt drives a Firestore TTL policy on `rate_limits` so windows
    // self-delete instead of accumulating forever (see docs/DATA-RETENTION.md).
    // That policy did not exist until 18.09.2026, and this comment was the only
    // evidence anybody had for it — `npm run retention:verify` is now the check
    // that the setting is really there and ACTIVE.
    const expiresAt = new Date(now + windowMs);

    if (!snap.exists) {
      tx.set(ref, { timestamps: [now], updatedAt: FieldValue.serverTimestamp(), expiresAt });
      return;
    }

    const data = snap.data()!;
    const timestamps: number[] = (data.timestamps || []).filter(
      (t: number) => t > windowStart,
    );

    if (timestamps.length >= maxRequests) {
      const retryAfterMs = timestamps[0] + windowMs - now;
      throw new QuotaError(
        `Rate limit exceeded. Please try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
        429,
      );
    }

    timestamps.push(now);
    tx.set(ref, { timestamps, updatedAt: FieldValue.serverTimestamp(), expiresAt });
  });
}

/**
 * The client address a rate-limit key is built from.
 *
 * `X-Forwarded-For` is a list the request grows as it travels: every hop
 * appends the peer it saw, and the beginning is whatever the client sent. This
 * took the first entry — the one the caller writes — so one new header value
 * per request was a new window each time, and every per-IP limit, including
 * the unauthenticated ones, was a formality. On Cloud Run the Google front end
 * appends the connecting address as the last entry, and the service sits
 * behind it directly (domain mapping, no load balancer that would add an entry
 * of its own), so the last entry is the only one the client did not choose.
 * `x-real-ip` is not set there; it stays for a local proxy that sets it.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return request.headers.get('x-real-ip')?.trim() || '0.0.0.0';
}
