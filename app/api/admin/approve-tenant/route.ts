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
    //
    // With one exception, and it was found by taking the redaction too far:
    // `lib/approval-token.ts` marks its own refusals with the prefix `Invalid
    // verification token:`. That is not an internal — it is the answer an
    // administrator came for, and swallowing it turned a rejected token into
    // "Internal Server Error", which says nothing and invites a retry with the
    // same token. So the prefix goes back to the caller and the detail after
    // the colon does not: "expired", "signature", "does not match the action"
    // tell an outsider which check failed, and the caller needs none of them.
    //
    // And the status has to say the same thing as the body, which it did not:
    // the refusal read "Invalid verification token." over a 500, so a client
    // that treats 5xx as transient retries the very token this comment argues
    // it must not retry (QA review of 9e408888bfec, 63d1d473cc3d). A refused
    // token is now 400, joining the two payload refusals above: the caller got
    // through `verifyAdminRequest` and `assertAdminStepUp`, so their identity
    // is not in doubt and 401 would send them to re-authenticate for nothing —
    // what is wrong is the `token` field they sent. 500 stays for the failures
    // nobody chose.
    const message = errMessage(error);
    const deliberate = message.startsWith('Invalid verification token');
    logger.error('approve-tenant failed', { route: 'api/admin/approve-tenant', error: message });
    return NextResponse.json(
      { error: deliberate ? 'Invalid verification token.' : 'Internal Server Error' },
      { status: deliberate ? 400 : 500 },
    );
  }
}
