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
    const body = await req.json().catch(() => null);
    const email = typeof decodedToken.email === 'string' ? decodedToken.email : '';
    // Resolved before the transaction: it reads a different document, and a
    // transaction's reads all have to happen before its first write.
    const actorEmail = await auditActorEmail(db, decodedToken.uid);

    // Read, decide and write in one transaction.
    //
    // The three used to be three separate steps: the project was read, the
    // command was validated against that snapshot, and a batch then merged the
    // decision onto whatever the project had become. Between the read and the
    // commit, `/api/runs/create` can make a different run the active one — the
    // evidence build takes seconds and a second tab is all it needs. The
    // sign-off was then validated against run A and landed on a project whose
    // active run was B, so the audit pack carried an architect's approval for a
    // run the architect never saw (QA full review of a19945ef01dc).
    //
    // A transaction closes it at the source: the snapshot the decision is made
    // on is the snapshot the write is conditional on, and Firestore retries the
    // whole body if the document moved underneath. The project fields and the
    // journal entry still commit together or not at all, which is what the batch
    // was there for (QA review of fafb3299ae6c) — a transaction is a batch that
    // also promises nothing changed while it was deciding.
    type CommandOutcome =
      | { status: 200; fields: Record<string, unknown> }
      | { status: number; error: string; code?: string };
    const outcome: CommandOutcome = await db.runTransaction(
      async (tx: {
        get: (r: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        set: (r: unknown, data: Record<string, unknown>, opts?: { merge: boolean }) => void;
      }): Promise<CommandOutcome> => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { status: 404, error: 'Project not found.' };
        const project = snap.data() || {};
        // Owner only. An operator recording somebody else's sign-off is the worse
        // half of an operator reading their code, and the rules stopped allowing
        // that on 16.09.2026.
        if (project.userId !== decodedToken.uid) {
          return { status: 403, error: 'Unauthorized.' };
        }

        const state: ProjectCommandState = {
          activeRunId: project.activeRunId,
          approvedByArchitect: project.approvedByArchitect,
          originalRecommendation: project.originalRecommendation,
          extensibilityRoute: project.extensibilityRoute,
        };
        const decision = validateProjectCommand(body, state, { email, now: new Date().toISOString() });
        if (!decision.ok) {
          return { status: decision.status, error: decision.error, code: decision.code };
        }

        // Every change into the journal (SCHNITT-0-UMFANG §8, package 1), written
        // by the Admin SDK into `audit_events`, which no client can read or write.
        // The command still writes exactly the fields `validateProjectCommand`
        // returns and no others — the transaction changes when they are written,
        // not what.
        tx.set(ref, { ...decision.fields, updatedAt: new Date() }, { merge: true });
        tx.set(db.collection('audit_events').doc(), {
          actorUid: decodedToken.uid,
          actorEmail,
          action: `${decision.action}:${projectId}`,
          targetUid: decodedToken.uid,
          timestamp: new Date(),
        });
        return { status: 200, fields: decision.fields };
      },
    );

    if (!('fields' in outcome)) {
      return NextResponse.json(
        outcome.code ? { error: outcome.error, code: outcome.code } : { error: outcome.error },
        { status: outcome.status },
      );
    }

    return NextResponse.json({ ok: true, fields: outcome.fields });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to run the command.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
