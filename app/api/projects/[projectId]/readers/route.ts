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
import { logger, errMessage } from '@/lib/logger';
import { projectReaderOverview, readersAfterRevoke, isProjectOwner } from '@/lib/project-readers';
import type { Invitation, InvitationStatus } from '@/lib/invitations';

/**
 * Roadmap 5.5 — Übersicht und Widerruf.
 *
 * GET    → who has Einsicht into this project, and since when.
 * DELETE → take it away. Effective immediately, and at the rules.
 *
 * Both are the owner's, and only the owner's. An administrator does not
 * qualify: `firestore.rules` stopped letting one read a project on 16.09.2026,
 * and a route that let one read — or change — the list of who else may would
 * hand that back through the side door.
 *
 * "Wer seit wann" comes off the server's own record. The name and the address
 * are on the invitation, written by the Admin SDK when it was accepted; the
 * timestamp is the server clock at that moment. Nothing on this page was ever
 * typed by a browser.
 *
 * The revocation is a single write to a single field on a single document —
 * `projects/{projectId}.readers` — because that is the only fact the read rule
 * consults. There is no second copy to miss: after this returns, a client
 * `getDoc` on the project fails with `permission-denied`, and
 * `GET /api/projects/{projectId}` stops handing out the run, both because they
 * read the same list. The invitation is marked `revoked` in the same
 * transaction so the overview and the register agree, but the invitation is the
 * record, not the permission.
 */

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

/** The Admin SDK is reached through a dynamic import, so its handles arrive untyped. */
interface InviteDoc {
  id: string;
  ref: unknown;
  data: () => Record<string, unknown>;
}
interface Tx {
  get: (r: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set: (r: unknown, data: Record<string, unknown>, opts?: { merge: boolean }) => void;
}

/** A Firestore Timestamp, a Date or an ISO string, as ISO. Never a browser's word. */
function isoOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return null;
}

function invitationOf(id: string, data: Record<string, unknown>, projectId: string): Invitation {
  const invitedBy = (data.invitedBy || {}) as { uid?: string; name?: string };
  const acceptedBy = data.acceptedBy as { uid?: string; email?: string } | null | undefined;
  return {
    id,
    projectId,
    email: typeof data.email === 'string' ? data.email : '',
    invitedBy: { uid: invitedBy.uid ?? '', name: invitedBy.name ?? '' },
    invitedAt: isoOf(data.invitedAt) ?? '',
    expiresAt: isoOf(data.expiresAt) ?? '',
    status: (data.status as InvitationStatus) ?? 'pending',
    acceptedBy: acceptedBy?.uid ? { uid: acceptedBy.uid, email: acceptedBy.email ?? '' } : null,
    acceptedAt: isoOf(data.acceptedAt),
    revokedAt: isoOf(data.revokedAt),
  };
}

async function openAsOwner(
  req: NextRequest,
  params: Promise<{ projectId: string }>,
): Promise<
  | { ok: true; uid: string; projectId: string; db: AdminDb; project: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  try {
    await assertMfaSatisfied(req, decoded);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      ),
    };
  }

  // Both verbs, not only the write.
  //
  // These two gates sat behind an `if (mutating)`, and GET passed `false` — so
  // the read of the access list was the one door in this file with no limit and
  // no account check on it. That read is not the lesser half: it hands out the
  // e-mail address of every person who accepted an invitation, which is other
  // people's personal data, and a suspended account kept taking it out, as
  // often as it liked (security audit of b88c77b). The list of who may read a
  // project is not less sensitive than the act of changing it.
  try {
    await assertRateLimit(`project-readers:${decoded.uid}`, 60, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
    };
  }
  // Revoking is how an owner stops a mistake, so it is not gated on the terms
  // version or on approval — only a hard-suspended account is refused. The same
  // holds for reading the list, and for the same reason: an owner who is being
  // asked to re-accept the Terms must still be able to see, and end, somebody
  // else's access to their source code.
  try {
    await assertAccountActive(decoded.uid);
  } catch (gateErr: unknown) {
    if (gateErr instanceof QuotaError) {
      return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
    }
    throw gateErr;
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }

  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  // "Not yours" and "not there" answer the same, so that this route cannot be
  // used to find out which project ids exist.
  if (!snap.exists) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const project = (snap.data() || {}) as Record<string, unknown>;
  if (!isProjectOwner(project, decoded.uid)) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  return { ok: true, uid: decoded.uid, projectId, db, project };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openAsOwner(req, params);
    if (!gate.ok) return gate.response;

    const invitesSnap = await gate.db
      .collection('projects').doc(gate.projectId)
      .collection('invitations')
      .get();
    const invitations = invitesSnap.docs.map((d: InviteDoc) =>
      invitationOf(d.id, d.data() as Record<string, unknown>, gate.projectId));

    // Only the accepted ones, and only their uid, address and date — the
    // pending invitations, with the addresses of people who have not answered,
    // are not what this endpoint is for.
    const { entries, unaccountedUids } = projectReaderOverview(gate.project, invitations);
    return NextResponse.json({ entries, unaccountedUids });
  } catch (err: unknown) {
    // Whatever threw here came from the Admin SDK and speaks about our own
    // collections and document ids. The caller gets the fixed sentence; the
    // reason goes to the log (security audit of b88c77b).
    logger.error('project readers read failed', {
      route: 'api/projects/[projectId]/readers',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Failed to read the access list.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openAsOwner(req, params);
    if (!gate.ok) return gate.response;

    let body: { uid?: unknown } = {};
    try {
      body = (await req.json()) as { uid?: unknown };
    } catch {
      body = {};
    }
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid.' }, { status: 400 });
    }
    if (uid === gate.uid) {
      // An owner cannot revoke themselves out of their own project: the read
      // rule answers on `userId`, so it would change nothing and only look as
      // if it had.
      return NextResponse.json({ error: 'The owner cannot be revoked.' }, { status: 400 });
    }

    const actorEmail = await auditActorEmail(gate.db, gate.uid);
    const projectRef = gate.db.collection('projects').doc(gate.projectId);
    const invitesSnap = await projectRef.collection('invitations').get();
    const affected = invitesSnap.docs.filter((d: InviteDoc) => {
      const data = d.data() as Record<string, unknown>;
      const acceptedBy = data.acceptedBy as { uid?: string } | null | undefined;
      return acceptedBy?.uid === uid && data.status === 'accepted';
    });

    const revokedAt = new Date().toISOString();
    await gate.db.runTransaction(async (tx: Tx) => {
      const fresh = await tx.get(projectRef);
      // A revocation against a project that is gone must not bring it back.
      //
      // The transaction already read the document; it simply did not ask whether
      // it was there. `tx.set(..., { merge: true })` on a missing document
      // *creates* it, so a revocation racing a project deletion — or an account
      // erasure, which deletes projects recursively — left behind a projects
      // document holding nothing but a `readers` array. It has no `userId`, so
      // `firestore.rules:204` hides it from the owner who thought it deleted,
      // while the row sits in the database (QA full review of 3131afa,
      // 3e32d011b3c6).
      if (!fresh.exists) throw new Error('project-gone');
      const project = (fresh.data() || {}) as Record<string, unknown>;
      // The list is recomputed inside the transaction, so two revocations at
      // once cannot put back what the other took away.
      tx.set(projectRef, { readers: readersAfterRevoke(project, uid) }, { merge: true });
      for (const invite of affected) {
        tx.set(invite.ref, { status: 'revoked', revokedAt }, { merge: true });
      }
      tx.set(gate.db.collection('audit_events').doc(), {
        actorUid: gate.uid,
        actorEmail,
        action: `project.reader.revoke:${gate.projectId}`,
        targetUid: uid,
        timestamp: new Date(),
      });
    });

    return NextResponse.json({ ok: true, uid, revokedAt, invitationsRevoked: affected.length });
  } catch (err: unknown) {
    // The project disappeared under the revocation. Not a fault of this server,
    // and not a 5xx: a client that retries transient errors would send the same
    // doomed request again. The caller asked to take access away from something
    // that no longer exists, which is the outcome it wanted.
    if (errMessage(err) === 'project-gone') {
      return NextResponse.json({ error: 'This project no longer exists.' }, { status: 404 });
    }
    logger.error('project readers revoke failed', {
      route: 'api/projects/[projectId]/readers',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Failed to revoke access.' }, { status: 500 });
  }
}
