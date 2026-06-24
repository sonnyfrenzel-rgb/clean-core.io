import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, deleteUserDataAndAccount } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await deleteUserDataAndAccount(decodedToken.uid);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[account-delete] Error during user account erasure:', error);
    
    // Check if error is due to requires-recent-login from Firebase Auth
    if (error.code === 'auth/requires-recent-login' || error.message?.includes('requires-recent-login')) {
      return NextResponse.json({
        error: 'Security restriction: Deleting your account requires a recent login. Please sign out, sign back in, and try deleting your account again.',
        code: 'requires-recent-login'
      }, { status: 400 });
    }
    
    return NextResponse.json({ error: 'Internal Server Error during data erasure.' }, { status: 500 });
  }
}
