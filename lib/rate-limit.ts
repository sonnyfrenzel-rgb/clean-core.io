import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAdminDb, QuotaError } from '@/lib/firebase-admin';

// F-10: pepper used to pseudonymise the composite key into an opaque doc ID so the
// rate_limits collection holds no durable PII (was `gemini:<uid>:<ip>` in cleartext).
const RATE_LIMIT_PEPPER =
  process.env.RATE_LIMIT_PEPPER || process.env.AUDIT_SIGNING_KEY || 'rate-limit-dev-pepper';

function rateLimitDocId(key: string): string {
  return crypto.createHmac('sha256', RATE_LIMIT_PEPPER).update(key).digest('hex');
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
 * Extract client IP from a NextRequest (works behind proxies).
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}
