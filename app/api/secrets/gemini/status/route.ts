import { NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb } from '@/lib/firebase-admin';

/**
 * GET /api/secrets/gemini/status
 *
 * Retrieves metadata about the user's custom Gemini API key configuration.
 */
export async function GET(req: Request) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { db } = await getAdminDb();
    const snap = await db.collection('user_secrets').doc(decodedToken.uid).collection('providers').doc('gemini').get();
    if (!snap.exists) {
      return NextResponse.json({ byokConfigured: false, last4: '', rotatedAt: null });
    }

    const data = snap.data();
    return NextResponse.json({
      byokConfigured: true,
      last4: data?.last4 || '',
      rotatedAt: data?.rotatedAt ? data.rotatedAt.toDate().toISOString() : null,
    });
  } catch (err: any) {
    console.error('Error fetching Gemini key status:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch status.' }, { status: 500 });
  }
}
