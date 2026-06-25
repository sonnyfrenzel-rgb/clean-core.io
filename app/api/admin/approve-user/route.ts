import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, approveUserWithToken, assertAdminStepUp } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller as Admin
    const decodedAdmin = await verifyAdminRequest(req);
    if (!decodedAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin privileges required.' }, { status: 403 });
    }

    try {
      await assertAdminStepUp(req, decodedAdmin);
    } catch (stepUpErr: any) {
      return NextResponse.json(
        { error: stepUpErr.message || 'Recent administrator step-up verification required.' },
        { status: stepUpErr.status || 403 },
      );
    }

    const body = await req.json();
    const { uid, token, action } = body;

    if (!uid || !token || !action) {
      return NextResponse.json({ error: 'Missing required parameters: uid, token, action.' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject".' }, { status: 400 });
    }

    // 2. Perform validation and operation server-side
    await approveUserWithToken(decodedAdmin.uid, uid, token, action);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[approve-user] Error in admin user approval:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
