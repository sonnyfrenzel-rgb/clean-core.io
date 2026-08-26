import { NextResponse } from 'next/server';
import { verifyAdminRequest, setAdminClaim, assertAdminStepUp } from '@/lib/firebase-admin';

/**
 * POST /api/admin/set-admin-claim
 *
 * Admin-only. Sets or revokes the `admin` custom claim on a target user, and
 * mirrors the boolean to users/{uid}.isAdmin for UI display.
 *
 * Body: { uid: string, isAdmin?: boolean }   // isAdmin defaults to true
 *
 * Note: after a claim change the target user must refresh their ID token
 * (re-login or getIdToken(true)) before the new claim takes effect in the
 * Firestore rules and on subsequent server requests.
 */
export async function POST(req: Request) {
  const admin = await verifyAdminRequest(req);
  if (!admin) {
    return NextResponse.json(
      { error: 'Forbidden: administrator privileges required.' },
      { status: 403 },
    );
  }

  try {
    await assertAdminStepUp(req, admin);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Recent administrator step-up verification required.' },
      { status: e?.status || 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { uid, isAdmin } = body as { uid?: string; isAdmin?: boolean };

  if (!uid || typeof uid !== 'string') {
    return NextResponse.json({ error: 'Missing required field: uid.' }, { status: 400 });
  }

  // This used to grant the claim for every value that was not the boolean false
  // — including the STRING "false" and the string "0". Privilege changes have to
  // be explicit, so the payload must say which way it means.
  if (typeof isAdmin !== 'boolean') {
    return NextResponse.json(
      { error: 'Field "isAdmin" must be a boolean — true to grant, false to revoke.' },
      { status: 400 },
    );
  }
  const grant = isAdmin;
  try {
    await setAdminClaim(uid, grant);
    return NextResponse.json({ ok: true, uid, isAdmin: grant });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to set admin claim.' },
      { status: 500 },
    );
  }
}
