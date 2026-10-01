import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, assertMfaSatisfied, assertAccountActive, getAdminDb, QuotaError } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger, errMessage } from '@/lib/logger';
import { INVITATION_COLLECTION } from '@/lib/invitations';
import { openInvitationsOf, type OpenInvitation } from '@/lib/open-invitations';

/**
 * GET → every invitation still waiting on a project this account owns — the
 * sharing section of "My workspace" (owner decision 01.10.2026: while an
 * invitation is unanswered, the person who sent it sees the address, the date
 * it expires, and a way to withdraw it).
 *
 * One request for the whole list rather than one per project row, so looking
 * at the workspace costs one unit of a budget of its own. Read over the
 * account's own projects (`userId == uid`), never across anybody else's: the
 * answer can only contain invitations the caller sent from a project the
 * caller owns. Withdrawing goes through `DELETE
 * /api/projects/{projectId}/invitations/{invitationId}`, which checks the
 * ownership again on its own.
 *
 * Read-only, behind the second factor, and not gated on the terms version —
 * an owner who must re-accept the Terms still sees who was invited to read
 * their source code.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The most projects one answer looks into. An owner with more sees the newest. */
const MAX_PROJECTS = 100;

interface DocLike {
  id: string;
  data: () => Record<string, unknown>;
}

interface AccountOpenInvitation extends OpenInvitation {
  projectId: string;
  projectName: string;
}

export async function GET(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
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
      await assertRateLimit(`invitations-account:${decodedToken.uid}`, 120, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }
    try {
      await assertAccountActive(decodedToken.uid);
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    const { db } = await getAdminDb();
    const projects = await db
      .collection('projects')
      .where('userId', '==', decodedToken.uid)
      .limit(MAX_PROJECTS)
      .get();

    const open: AccountOpenInvitation[] = [];
    await Promise.all(
      projects.docs.map(async (project: DocLike) => {
        const snap = await db
          .collection('projects').doc(project.id)
          .collection(INVITATION_COLLECTION)
          .get();
        const name = String((project.data() || {}).name ?? '');
        for (const invitation of openInvitationsOf(snap.docs, project.id)) {
          open.push({ ...invitation, projectId: project.id, projectName: name });
        }
      }),
    );
    open.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    return NextResponse.json({ open });
  } catch (err: unknown) {
    logger.error('account open invitations could not be read', {
      route: 'api/invitations',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not read your open invitations.' }, { status: 500 });
  }
}
