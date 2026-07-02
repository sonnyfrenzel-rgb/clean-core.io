import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * Liveness / readiness probe for Cloud Run health checks and uptime monitoring.
 *
 * Shallow (default): process is up + required signing/AI config present — cheap,
 *   safe to poll frequently. Returns 200 when healthy, 503 when misconfigured.
 * Deep (`?deep=1`): additionally pings Firestore. Use sparingly (costs a read).
 *
 * The response is intentionally minimal (no per-check booleans) so an
 * unauthenticated caller cannot learn which secret is missing.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';

  const signingKeyOk = !!process.env.AUDIT_SIGNING_KEY;
  const geminiOk = !!process.env.GEMINI_API_KEY;

  let firestoreOk = true;
  if (deep) {
    try {
      const { db } = await getAdminDb();
      await db.collection('_health').doc('ping').get();
    } catch {
      firestoreOk = false;
    }
  }

  const healthy = signingKeyOk && geminiOk && firestoreOk;

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', version: APP_VERSION, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
