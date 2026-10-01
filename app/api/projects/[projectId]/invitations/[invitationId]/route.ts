import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, assertMfaSatisfied, auditActorEmail } from '@/lib/firebase-admin';
import { logger, errMessage } from '@/lib/logger';
import { isFirestoreId } from '@/lib/firestore-id';
import { openInvitationsAsOwner } from '@/lib/invitation-owner-gate';
import { INVITATION_COLLECTION, effectiveStatus, type Invitation } from '@/lib/invitations';

/**
 * DELETE → withdraw one invitation that is still waiting (owner decision
 * 01.10.2026).
 *
 * The same withdrawal the system already makes when a mail does not go out
 * (`POST …/invitations`): `status: 'revoked'` and the server's time in
 * `revokedAt`. The accept route refuses anything that is not `pending`, so the
 * link stops working the moment this returns — and a withdrawn invitation no
 * longer holds one of the three open slots.
 *
 * It withdraws an *open* invitation and nothing else. One that was accepted is
 * a reader now, and ending that is the readers route's revocation, which also
 * takes the uid off the project document; doing half of it here would leave a
 * reader who can still read. Expired or already withdrawn is answered as
 * such — nothing is written.
 *
 * The owner's only, behind the second factor. The invitation and the project
 * are read again inside the transaction, so a withdrawal racing an acceptance
 * or a deletion cannot write over the newer state, or bring a deleted project
 * back by writing beneath it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Snap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}
interface Tx {
  get: (r: unknown) => Promise<Snap>;
  set: (r: unknown, data: Record<string, unknown>, opts?: { merge: boolean }) => void;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invitationId: string }> },
) {
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

    const { projectId, invitationId } = await params;
    // The gate checks the project id too; checked here as well so the route
    // file alone shows both ids are well-formed before any path (SEC-2026-514).
    if (!isFirestoreId(projectId)) {
      return NextResponse.json({ error: 'Invalid project id.' }, { status: 400 });
    }
    if (!isFirestoreId(invitationId)) {
      return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 });
    }
    const gate = await openInvitationsAsOwner(decodedToken.uid, projectId, 'invitations-withdraw');
    if (!gate.ok) return gate.response;

    const db = gate.db;
    const projectRef = db.collection('projects').doc(gate.projectId);
    const invitationRef = projectRef.collection(INVITATION_COLLECTION).doc(invitationId);
    const actorEmail = await auditActorEmail(db, gate.uid);
    const revokedAt = new Date().toISOString();

    const outcome = await db.runTransaction(async (tx: Tx) => {
      const [project, invitation] = await Promise.all([tx.get(projectRef), tx.get(invitationRef)]);
      if (!project.exists || (project.data() || {}).userId !== gate.uid) return 'gone' as const;
      if (!invitation.exists) return 'gone' as const;
      const data = (invitation.data() || {}) as Partial<Invitation>;
      if (data.projectId !== gate.projectId) return 'gone' as const;
      const status = effectiveStatus({
        status: data.status ?? 'pending',
        expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
      });
      if (status === 'accepted') return 'accepted' as const;
      if (status !== 'pending') return 'not-open' as const;

      tx.set(invitationRef, { status: 'revoked', revokedAt }, { merge: true });
      tx.set(db.collection('audit_events').doc(), {
        actorUid: gate.uid,
        actorEmail,
        action: `project.invitation.withdraw:${gate.projectId}`,
        targetId: invitationId,
        timestamp: new Date(),
      });
      return 'withdrawn' as const;
    });

    if (outcome === 'gone') {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }
    if (outcome === 'accepted') {
      return NextResponse.json(
        {
          error: 'This invitation was already accepted. End the read access under "Who can read this project" instead.',
          code: 'accepted',
        },
        { status: 409 },
      );
    }
    if (outcome === 'not-open') {
      return NextResponse.json(
        { error: 'This invitation is no longer open — it expired or was withdrawn.', code: 'not-open' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, id: invitationId, revokedAt });
  } catch (err: unknown) {
    logger.error('invitation could not be withdrawn', {
      route: 'api/projects/[projectId]/invitations/[invitationId]',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not withdraw this invitation.' }, { status: 500 });
  }
}
