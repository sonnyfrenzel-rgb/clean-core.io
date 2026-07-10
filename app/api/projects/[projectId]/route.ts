import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, assertAccountActive, QuotaError } from '@/lib/firebase-admin';

/**
 * DELETE /api/projects/{projectId}
 *
 * F-03: Server-authoritative project deletion. Firestore does NOT cascade
 * subcollections when the parent document is deleted, so a client-side
 * `deleteDoc(projects/{id})` orphaned the immutable `runs/{runId}` subcollection
 * (analysis evidence/narrative). This route verifies ownership and uses the Admin
 * SDK `recursiveDelete`, so the project AND all of its runs/subcollections are
 * purged. The client-side project-delete rule is disabled in firestore.rules —
 * project deletion now goes exclusively through the Admin SDK.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decoded = await verifyRequestAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const ref = db.collection('projects').doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) {
      // Idempotent — treat an already-deleted project as success.
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const isAdmin = decoded.admin === true;
    const isOwner = snap.data()?.userId === decoded.uid;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized to delete this project.' }, { status: 403 });
    }

    // Deleting your own data must stay possible even while pending, so we do NOT
    // requireApproved here — assertAccountActive only blocks hard-suspended accounts.
    try {
      await assertAccountActive(decoded.uid, { isAdminClaim: isAdmin });
    } catch (gateErr: any) {
      if (gateErr instanceof QuotaError) return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      throw gateErr;
    }

    // recursiveDelete purges the parent doc AND the runs/{runId} subcollection.
    await db.recursiveDelete(ref);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete project.' }, { status: 500 });
  }
}
