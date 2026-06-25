import { NextRequest } from 'next/server';
import { getAdminDb, QuotaError } from '@/lib/firebase-admin';

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
  const ref = db.collection('rate_limits').doc(key);

  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!snap.exists) {
      tx.set(ref, { timestamps: [now], updatedAt: FieldValue.serverTimestamp() });
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
    tx.set(ref, { timestamps, updatedAt: FieldValue.serverTimestamp() });
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
