import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, getAdminDb, assertAccountActive, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { isProjectOwner, mayReadProject } from '@/lib/project-readers';
import { logger, errMessage } from '@/lib/logger';

/**
 * GET /api/projects/{projectId}  — roadmap 5.4
 *
 * The active run of a project, for somebody who may read that project.
 *
 * `firestore.rules` lets an invited reader read the project document itself —
 * the ABAP source is on it — but leaves `projects/{id}/runs/{runId}` owner-only.
 * A rule there could only answer without a `get()` if every run document
 * carried its own copy of `readers`, and then a revocation would have to land
 * in as many documents as the project has runs. A revocation that must succeed
 * everywhere is weaker than one that succeeds in a single place, so the run
 * comes through here instead, and this route re-reads `readers` off the one
 * project document on every request. The moment the owner revokes, the rule and
 * this route stop answering from the same fact, in the same instant.
 *
 * Read only. It returns the stored run and nothing computed, it takes no body,
 * and it grants nobody a write of any kind. `role` is what the caller is, not
 * what they asked to be: the client uses it to know that generating,
 * confirming, signing and exporting are not theirs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decoded = await verifyRequestAuth(req);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // The subject is a project's evidence, so a token from before the second
    // factor reads it here no more than it does anywhere else.
    try {
      await assertMfaSatisfied(req, decoded);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }

    const { projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const ref = db.collection('projects').doc(projectId);
    const snap = await ref.get();
    // Same answer for "no such project" and "not yours": a 404 that only
    // appears for projects that exist is a way to ask whether one does.
    if (!snap.exists) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const project = snap.data() || {};
    if (!mayReadProject(project, decoded.uid)) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const activeRunId = typeof project.activeRunId === 'string' ? project.activeRunId : null;
    let run: Record<string, unknown> | null = null;
    if (activeRunId) {
      const runSnap = await ref.collection('runs').doc(activeRunId).get();
      run = runSnap.exists ? (runSnap.data() as Record<string, unknown>) : null;
    }

    return NextResponse.json({
      role: isProjectOwner(project, decoded.uid) ? 'owner' : 'reader',
      activeRunId,
      run,
    });
  } catch (err: unknown) {
    // The route above is careful never to say whether a project exists; an
    // Admin SDK error forwarded verbatim would say it anyway, by naming the
    // document it failed on (security audit of b88c77b).
    logger.error('project read failed', { route: 'api/projects/[projectId]', error: errMessage(err) });
    return NextResponse.json({ error: 'Failed to read project.' }, { status: 500 });
  }
}

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

    // Server-side MFA gate: deleting a project destroys its runs, and those
    // are the evidence chain. An ID token obtained before the TOTP prompt must
    // not be enough to erase it.
    try {
      await assertMfaSatisfied(req, decoded);
    } catch (mfaErr: any) {
      return NextResponse.json(
        { error: mfaErr?.message || 'Multi-factor authentication required.' },
        { status: mfaErr?.status || 403 },
      );
    }

    const { projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const ref = db.collection('projects').doc(projectId);
    const snap = await ref.get();

    // Owner only. The administrator claim does not open this door.
    //
    // It used to: `decoded.admin === true` stood in for ownership, and the only
    // other gate on the route is `assertMfaSatisfied`, which lets any token
    // through for an account whose profile does not say `mfaEnabled`
    // (`mfaSatisfied` in lib/mfa-gate.ts returns null for such an account). An
    // administrator who never enrolled a second factor could therefore erase
    // anyone's project and every signed run under it from a plain ID token —
    // without the step-up the admin routes require (`assertAdminStepUp`),
    // without the withdrawn-claim mirror check `verifyAdminRequest` does, and
    // without an audit event (QA full review of a19945ef01dc, 6a3eea208009).
    //
    // Nothing loses a function. The only caller is the owner's own dashboard
    // (app/(app)/dashboard/page.tsx), and `firestore.rules` took the operator's
    // read of a project away on 16.09.2026 — an administrator cannot list or
    // open somebody else's project at all, so a route that let them destroy one
    // was the loudest of the three permissions and the only one left. An
    // emergency stays what that rule says it is: a deliberate Admin SDK act
    // with a record, not an endpoint anyone holding the claim can call.
    //
    // "Not there" and "not yours" answer the same 404, exactly as GET above
    // does. A missing project used to be answered with `{ ok: true,
    // alreadyDeleted: true }` *before* anyone asked whose it was, while a
    // stranger's existing project was refused with 403 down here — and the two
    // answers together are an oracle: one DELETE per id tells an outsider which
    // project ids exist, without deleting anything (security audit of b88c77b).
    // The idempotent success was worth less than that. The only caller is the
    // owner's own dashboard, whose list comes from a realtime query, so the
    // second delete of the same project is not a case the product produces.
    const isOwner = snap.exists && snap.data()?.userId === decoded.uid;
    if (!isOwner) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    // Deleting your own data must stay possible even while pending, so we do NOT
    // requireApproved here — assertAccountActive only blocks hard-suspended accounts.
    // No `isAdminClaim` either: it only relaxes `requireApproved` and
    // `requireCurrentTerms`, neither of which is asked for here, so it never
    // decided anything on this route.
    try {
      await assertAccountActive(decoded.uid);
    } catch (gateErr: any) {
      if (gateErr instanceof QuotaError) return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      throw gateErr;
    }

    // recursiveDelete purges the parent doc AND the runs/{runId} subcollection.
    await db.recursiveDelete(ref);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    logger.error('project delete failed', { route: 'api/projects/[projectId]', error: errMessage(err) });
    return NextResponse.json({ error: 'Failed to delete project.' }, { status: 500 });
  }
}
