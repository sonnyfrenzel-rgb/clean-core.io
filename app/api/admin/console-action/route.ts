import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminRequest,
  assertAdminStepUp,
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

    // 2. Enforce recent re-authentication and recent MFA validation.
    try {
      await assertAdminStepUp(req, decodedAdmin);
    } catch (stepUpErr: any) {
      return NextResponse.json(
        { error: stepUpErr.message || 'Recent administrator step-up verification required.' },
        { status: stepUpErr.status || 403 },
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { uid, action } = body;

    if (!uid || !action) {
      return NextResponse.json({ error: 'Missing required parameters: uid, action.' }, { status: 400 });
    }

    // 4. Execute corresponding admin action server-side
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
