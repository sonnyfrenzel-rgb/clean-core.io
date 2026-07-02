import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, setAdminClaim } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  // F-15: Defense-in-Depth — THREE independent gates must ALL pass.
  // In production, Gate 1 alone blocks access. Gates 2+3 prevent
  // accidental exposure in preview/staging deployments.

  // Gate 1: Hard block on Cloud Run (K_SERVICE is set only in real deployments, not CI)
  if (process.env.K_SERVICE) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  // Gate 2: Emulator flag must be explicitly enabled
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  // Gate 3: Secret header must match server-side env (prevents unauthenticated access)
  const seedToken = req.headers.get('x-test-seed-token');
  if (!seedToken || seedToken !== process.env.PILOT_APPROVAL_SECRET) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const { action, collectionPath, docId, data, uid, claims } = await req.json();
    const { db } = await getAdminDb();

    if (action === 'setDoc') {
      await db.collection(collectionPath).doc(docId).set(data);
      return NextResponse.json({ success: true });
    }

    if (action === 'mergeDoc') {
      await db.collection(collectionPath).doc(docId).set(data, { merge: true });
      return NextResponse.json({ success: true });
    }

    if (action === 'setCustomClaim') {
      await setAdminClaim(uid, claims.admin === true);
      return NextResponse.json({ success: true });
    }

    // Read-back for verifying deletion of collections that client SDKs cannot read
    // (user_secrets, s4_credentials, mfa_* are `if false` in firestore.rules).
    if (action === 'existsDoc') {
      const snap = await db.collection(collectionPath).doc(docId).get();
      return NextResponse.json({ exists: snap.exists });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[Test Seed API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
