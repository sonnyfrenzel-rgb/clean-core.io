import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  auditActorEmail,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { validateProjectCommand, type ProjectCommandState } from '@/lib/project-commands';

/**
 * POST /api/projects/{projectId}/commands  — roadmap 0.7
 *
 * The only writer of the six project fields a browser may no longer touch:
 * `targetArchitecture`, `approvedByArchitect`, `architectJustifiedOverride`,
 * `architectSignOffAt`, `approvedBy` and `usageReport`.
 *
 * *„Eine Freigabe entsteht auf dem Server oder gar nicht."*
 * (`docs/roadmap/SCHNITT-0-UMFANG.md` §8.) Until this route existed, the design
 * stage wrote all five release fields straight from the browser — `approvedBy`
 * included, taken from `auth.currentUser.email`, which is to say the browser
 * chose whose name went on the sign-off. It now comes off the verified ID
 * token, and the timestamp off the server clock.
 *
 * What is checked, in order: a verified token · the second factor, when the
 * account requires one · a rate limit · the account is not suspended · the
 * caller **owns** the project — an administrator does not qualify, for the same
 * reason `firestore.rules` stopped letting one read a project at all · then the
 * transition itself, in `lib/project-commands.ts`, which the design stage reads
 * too so that both halves refuse the same things.
 *
 * Every accepted command writes an `audit_events` row (server-only collection,
 * Admin SDK). The refusals write nothing.
 */
export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // The sign-off is carried by the audit pack's decision record. A token
    // obtained before the second factor must not be able to record one.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }

    try {
      await assertRateLimit(`project-command:${decodedToken.uid}`, 60, 60_000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Too many requests. Please wait and try again.' },
        { status: q?.status || 429 },
      );
    }

    try {
      await assertAccountActive(decodedToken.uid, { isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    const { projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Missing project id.' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const ref = db.collection('projects').doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const project = snap.data() || {};
    // Owner only. An operator recording somebody else's sign-off is the worse
    // half of an operator reading their code, and the rules stopped allowing
    // that on 16.09.2026.
    if (project.userId !== decodedToken.uid) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const state: ProjectCommandState = {
      activeRunId: project.activeRunId,
      approvedByArchitect: project.approvedByArchitect,
      originalRecommendation: project.originalRecommendation,
      extensibilityRoute: project.extensibilityRoute,
    };
    const email = typeof decodedToken.email === 'string' ? decodedToken.email : '';
    const decision = validateProjectCommand(body, state, { email, now: new Date().toISOString() });
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error, code: decision.code }, { status: decision.status });
    }

    // Every change into the journal (SCHNITT-0-UMFANG §8, package 1), written by
    // the Admin SDK into `audit_events`, which no client can read or write.
    //
    // One batch, not two awaits. The field write used to go first and the
    // journal entry second, so a failing journal write left a recorded sign-off
    // with nothing recording it — and the caller saw a 500 for a change that had
    // already happened (QA review of fafb3299ae6c). Turning the order around
    // only moves the lie: then the journal names a sign-off that was never
    // written. A batch commits both or neither, and both documents live in the
    // same database, so nothing here needs a transaction.
    const actorEmail = await auditActorEmail(db, decodedToken.uid);
    const batch = db.batch();
    batch.set(ref, { ...decision.fields, updatedAt: new Date() }, { merge: true });
    batch.set(db.collection('audit_events').doc(), {
      actorUid: decodedToken.uid,
      actorEmail,
      action: `${decision.action}:${projectId}`,
      targetUid: decodedToken.uid,
      timestamp: new Date(),
    });
    await batch.commit();

    return NextResponse.json({ ok: true, fields: decision.fields });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run the command.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
