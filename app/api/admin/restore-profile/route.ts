import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, setAdminClaim } from '@/lib/firebase-admin';

// Lazy-loaded admin auth module
let adminAuthModule: any = null;

/**
 * TEMPORARY admin profile restore endpoint.
 * Secured by PILOT_APPROVAL_SECRET.
 * DELETE THIS FILE AFTER USE.
 *
 * POST /api/admin/restore-profile
 * Body: { email: string, secret: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { email, secret } = await req.json();

    if (!email || !secret) {
      return NextResponse.json({ error: 'Missing email or secret.' }, { status: 400 });
    }

    // Gate behind server secret
    if (secret !== process.env.PILOT_APPROVAL_SECRET) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const { db } = await getAdminDb();

    // Lazy-load admin auth
    if (!adminAuthModule) {
      adminAuthModule = await import('firebase-admin/auth');
    }
    const auth = adminAuthModule.getAuth();

    // Find the user by email
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
    }

    const uid = userRecord.uid;

    // Restore admin profile in Firestore (merge to preserve any existing fields)
    await db.collection('users').doc(uid).set({
      firstName: userRecord.displayName?.split(' ')[0] || 'Admin',
      lastName: userRecord.displayName?.split(' ').slice(1).join(' ') || '',
      email: userRecord.email || email,
      tier: 'unlimited',
      status: 'approved',
      transformationsUsed: 0,
      transformationsLimit: 999,
      maxTeamMembers: 50,
      orgId: null,
      identityProvider: 'google',
      createdAt: new Date(),
      isAdmin: true,
      authMethod: 'google',
    }, { merge: true });

    // Set admin custom claim
    await setAdminClaim(uid, true);

    // Update registration_requests to approved
    await db.collection('registration_requests').doc(uid).set({
      email: userRecord.email || email,
      name: userRecord.displayName || 'Admin',
      status: 'approved',
      createdAt: new Date(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      uid,
      email: userRecord.email,
      message: 'Admin profile restored. Please sign out and sign back in to refresh your token.',
    });
  } catch (err: any) {
    console.error('[restore-profile] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
