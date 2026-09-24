import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { deriveProjectDecision, DECISION_MAX_SOURCE_BYTES } from '@/lib/decision-facts';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * The decision of one project, derived — roadmap 8.4, the half the workspace
 * card reads.
 *
 * `GET` → `{ draft, stored, unchanged, runId, evidenceDigest, canDecide }`.
 *
 * **Why a route and not a call in the browser.** The draft binds the
 * architecture contract, and the contract is built from `buildAbapEvidence`,
 * which reaches the 4.3 MB merged SAP catalog — the rule `lib/first-look.ts`,
 * `/api/projects/{id}/findings` (8.1) and `/api/projects/{id}/contract` (8.3)
 * all keep. The need facts come from the reconstructed process and the rules
 * of the source, which `process-states` reads from the same place.
 *
 * **Why it writes nothing.** `decision` is a server-only project field, and
 * `POST /api/projects/{id}/commands` is its only writer (`record-decision-draft`,
 * `confirm-decision`, `withdraw-decision`). The card sends the draft this route
 * derived back through that command, where it is normalised and re-fingerprinted
 * again — this route is the reader, not a second writer.
 *
 * **`evidenceDigest` is the run the draft was derived from.** The card echoes
 * it as `expectedEvidenceDigest` when it confirms, so the 8.8 binding compares
 * the run the reader was shown against the run the project stands on at commit
 * time; a re-analysis in between ends in 409 with the server's sentence.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    // The decision is derived from the customer's own code. A token from before
    // the second factor reads neither, here as in Firestore.
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }
    // Not the cheap half: every read rebuilds the evidence and the rules of the
    // source. A budget of its own, as `process-states` gives its read.
    try {
      await assertRateLimit(`decision-read:${decodedToken.uid}`, 240, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }

    const { projectId } = await params;
    if (!projectId) return NextResponse.json({ error: 'No project named.' }, { status: 400 });
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });

    // A suspended account reads nothing here, as in Firestore (accountActive()).
    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return inactive;

    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(projectId).get();
    // One answer for "not there" and "not yours".
    if (!snap.exists || !mayReadProject(snap.data(), decodedToken.uid)) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;

    const derived = await deriveProjectDecision(db, projectId, data, new Date().toISOString());
    if (!derived.ok && derived.code === 'no-source') {
      return NextResponse.json(
        { error: 'No source is staged on this project, so no decision could be derived.', code: 'no-source' },
        { status: 409 },
      );
    }
    if (!derived.ok) {
      return NextResponse.json(
        {
          error: `This source is larger than the ${DECISION_MAX_SOURCE_BYTES} bytes a decision is derived from in one request.`,
          code: 'too-large',
        },
        { status: 413 },
      );
    }

    return NextResponse.json({
      ...derived.answer,
      runId: derived.runId,
      evidenceDigest: derived.evidenceDigest,
      // Reading is a share; deciding is the owner's (`commands` refuses anyone
      // else). Said here so the card does not offer a button that can only fail.
      canDecide: data.userId === decodedToken.uid,
    });
  } catch (err: unknown) {
    logger.error('project decision read failed', {
      route: 'api/projects/decision',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not derive the decision of this project.' }, { status: 500 });
  }
}
