import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminRequest,
  assertAdminStepUp,
  adminApproveUser,
  adminRevokeUser,
  adminGrantS4,
  adminRevokeS4,
  adminDeleteUser,
  adminBlockOwnModelKey,
  adminEndByokAgreement,
  getAdminAuth,
} from '@/lib/firebase-admin';
import { sendAgreementEndedMail } from '@/lib/byok-agreement-mail';
import { logger, errMessage } from '@/lib/logger';
import { isFirestoreId } from '@/lib/firestore-id';

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
    // Checked before the id forms any document path.
    if (!isFirestoreId(uid)) {
      return NextResponse.json({ error: 'Invalid uid.' }, { status: 400 });
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
      // 3.0.21 — the Additional Agreement on Own Model Keys ended in text form
      // (its clause 11, legal review E24): first block the stored key, so no
      // call goes out on it, then delete it. Both are recorded in the proof log;
      // the deletion is confirmed to the account's sign-in address.
      case 'block-own-key':
        await adminBlockOwnModelKey(decodedAdmin.uid, uid);
        break;
      case 'end-byok-agreement': {
        const { agreementEnded } = await adminEndByokAgreement(decodedAdmin.uid, uid);
        if (agreementEnded) {
          const email = await getAdminAuth().then((auth) => auth.getUser(uid)).then((u) => u.email ?? null, () => null);
          await sendAgreementEndedMail(email, uid, 'text-form');
        }
        break;
      }
      default:
        return NextResponse.json({ error: 'Invalid action name.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Same as its neighbour `approve-tenant`: the five actions above write
    // through the Admin SDK, and a failure there speaks about our own documents
    // and the target account. That belongs in the log;
    // the caller is told the action did not happen.
    logger.error('console-action failed', { route: 'api/admin/console-action', error: errMessage(error) });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
