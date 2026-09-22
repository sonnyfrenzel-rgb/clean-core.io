import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, approveTenantWithToken, assertAdminStepUp } from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';

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
    await approveTenantWithToken(decodedAdmin.uid, uid, token, action);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // The reason goes to the log, not to the caller. The failures that land
    // here are token comparisons and Admin SDK writes, and their messages name
    // the target account, the collection and sometimes the token itself — the
    // four refusals above are the ones an administrator is meant to read
    // (security audit of b88c77b).
    logger.error('approve-tenant failed', { route: 'api/admin/approve-tenant', error: errMessage(error) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
