import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, assertMfaStepUp } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const uid = decodedToken.uid;

    // Enforce recent login (within 5 minutes / 300 seconds) for sensitive operation
    const authTime = decodedToken.auth_time;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authTime > 300) {
      return NextResponse.json(
        { error: 'Security timeout. Please re-authenticate and try again.' },
        { status: 400 }
      );
    }

    // Enforce recent MFA verification
    try {
      await assertMfaStepUp(request, decodedToken);
    } catch (mfaErr: any) {
      return NextResponse.json(
        { error: mfaErr.message || 'Recent MFA step-up verification required.' },
        { status: 403 }
      );
    }

    const { db, FieldValue } = await getAdminDb();

    // 1. Delete the private MFA secrets document
    await db.collection('mfa_secrets').doc(uid).delete().catch(() => {});

    // 2. Disable MFA in the user profile and erase any legacy profile keys
    await db.collection('users').doc(uid).set(
      {
        mfaEnabled: false,
        mfaSecret: FieldValue.delete(),
        mfaBackupCodes: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[mfa/disable] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
