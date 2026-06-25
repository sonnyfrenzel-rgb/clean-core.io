import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminRequest,
  assertMfaSatisfied,
  adminApproveUser,
  adminRevokeUser,
  adminGrantS4,
  adminRevokeS4,
  adminDeleteUser,
} from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller as Admin
    const decodedAdmin = await verifyAdminRequest(req);
    if (!decodedAdmin) {
      return NextResponse.json({ error: 'Unauthorized. Admin privileges required.' }, { status: 403 });
    }

    // 2. Enforce recent re-authentication (within 5 minutes)
    const authTime = decodedAdmin.auth_time;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authTime > 300) {
      return NextResponse.json({ error: 'Security timeout. Please re-authenticate.' }, { status: 400 });
    }

    // 3. Enforce MFA validation
    try {
      await assertMfaSatisfied(req, decodedAdmin);
    } catch (mfaErr: any) {
      return NextResponse.json({ error: mfaErr.message || 'MFA verification required.' }, { status: 403 });
    }

    // 4. Parse request body
    const body = await req.json();
    const { uid, action } = body;

    if (!uid || !action) {
      return NextResponse.json({ error: 'Missing required parameters: uid, action.' }, { status: 400 });
    }

    // 5. Execute corresponding admin action server-side
    switch (action) {
      case 'approve-user':
        await adminApproveUser(decodedAdmin.uid, uid);
        break;
      case 'revoke-user':
        await adminRevokeUser(decodedAdmin.uid, uid);
        break;
      case 'grant-s4':
        await adminGrantS4(decodedAdmin.uid, uid);
        break;
      case 'revoke-s4':
        await adminRevokeS4(decodedAdmin.uid, uid);
        break;
      case 'delete-user':
        await adminDeleteUser(decodedAdmin.uid, uid);
        break;
      default:
        return NextResponse.json({ error: 'Invalid action name.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[console-action] Error executing admin action:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
