import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, setAdminClaim } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  // Strict check: fail-closed in production
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[Test Seed API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
