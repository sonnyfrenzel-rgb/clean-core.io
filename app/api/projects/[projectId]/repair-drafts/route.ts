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
import { adoptRepairDraft, proposeRepairDraft } from '@/lib/repair-draft-store';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * POST /api/projects/{projectId}/repair-drafts — roadmap 8.7 (CR-10)
 *
 *   { action: 'propose', parentDraftId?, expectedCodeDigest, expectedSuiteDigest, target, content }
 *     → 200 { draftId, draftDigest, codeDigest, suiteDigest, parent }
 *   { action: 'adopt', draftId, expectedDraftDigest }
 *     → 200 { draftId, fields }  |  409 with a sentence, nothing written
 *
 * A repair used to live only in the browser, and the runner — rightly — only
 * executes what the server holds, so the retry ran the old code. `propose`
 * turns the repair into an immutable server-side draft; `/api/run-tests` with
 * `draftId` runs exactly that draft and records the receipt on the draft;
 * `adopt` swaps it onto the project only if the project still stands where the
 * draft was cut. The decisions are in `lib/repair-draft.ts`, the transactions
 * in `lib/repair-draft-store.ts`.
 *
 * Gates in the order the commands route and the runner use: a verified token ·
 * the second factor · a rate limit · an approved, active account on current
 * Terms (as for the runner — a draft exists to be run) · ownership, inside the
 * transaction. An administrator is not an owner here either.
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

    // Adoption rewrites the generated code and puts a receipt on the project.
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
      await assertRateLimit(`repair-draft:${decodedToken.uid}`, 30, 60_000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Too many requests. Please wait and try again.' },
        { status: q?.status || 429 },
      );
    }

    try {
      await assertAccountActive(decodedToken.uid, {
        requireApproved: true,
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      const q = gateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Account not permitted.' }, { status: q?.status || 403 });
    }

    const { projectId } = await params;
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) {
      return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
    }
    const safeProjectId = projectId;

    const body = await req.json().catch(() => null);
    const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined;
    const { db } = await getAdminDb();

    if (action === 'propose') {
      const outcome = await proposeRepairDraft(db, {
        projectId: safeProjectId,
        uid: decodedToken.uid,
        body,
        now: new Date().toISOString(),
      });
      if (!('draft' in outcome)) {
        return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status });
      }
      const d = outcome.draft;
      // The draft's content stays on the server; the browser already has the
      // one file it asked the model for, and gets back what it needs to name
      // the draft to the runner and to adoption.
      return NextResponse.json({
        ok: true,
        draftId: d.draftId,
        draftDigest: d.draftDigest,
        codeDigest: d.codeDigest,
        suiteDigest: d.suiteDigest,
        parent: d.parent,
        parentDraftId: d.parentDraftId,
      });
    }

    if (action === 'adopt') {
      const actorEmail = await auditActorEmail(db, decodedToken.uid);
      const outcome = await adoptRepairDraft(db, {
        projectId: safeProjectId,
        uid: decodedToken.uid,
        body,
        now: new Date(),
        actorEmail,
      });
      if (!('fields' in outcome)) {
        return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status });
      }
      return NextResponse.json({ ok: true, draftId: outcome.draftId, fields: outcome.fields });
    }

    return NextResponse.json({ error: "action must be 'propose' or 'adopt'.", code: 'unknown-action' }, { status: 400 });
  } catch {
    // A fixed message: an internal error's text can carry server detail.
    return NextResponse.json({ error: 'The repair draft could not be processed.' }, { status: 500 });
  }
}
