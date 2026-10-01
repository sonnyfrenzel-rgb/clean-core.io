import { NextResponse } from 'next/server';
import { getAdminDb, assertAccountActive, QuotaError } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { isProjectOwner } from '@/lib/project-readers';
import { isFirestoreId } from '@/lib/firestore-id';
export { openInvitationsOf, type OpenInvitation } from '@/lib/open-invitations';

/**
 * The owner's view of the invitations still waiting on a project — the half of
 * sharing the owner decided on 01.10.2026: while an invitation is unanswered,
 * the person who sent it sees the address, the date it expires, and a way to
 * withdraw it.
 *
 * Server-only, and the owner's only. The two routes that use it
 * (`GET /api/projects/{id}/invitations`, `DELETE
 * /api/projects/{id}/invitations/{invitationId}`) verify the ID token and the
 * second factor themselves — the MFA coverage guard reads that call in the
 * route file — and then hand the decoded uid here for everything that is the
 * same in both: a rate budget of their own (reading the list must never use up
 * what a withdrawal needs), an account that is not suspended, a well-formed
 * project id, and ownership. "Not yours" and "not there" answer the same 404,
 * so neither route can be used to learn which project ids exist.
 *
 * Not gated on the terms version, for the reason the readers route gives: an
 * owner who is being asked to re-accept the Terms must still be able to see,
 * and stop, an invitation to their own source code.
 */

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

export type OwnerGate =
  | { ok: true; uid: string; projectId: string; db: AdminDb }
  | { ok: false; response: NextResponse };

export async function openInvitationsAsOwner(
  uid: string,
  rawProjectId: unknown,
  rateKey: 'invitations-list' | 'invitations-withdraw',
): Promise<OwnerGate> {
  try {
    await assertRateLimit(`${rateKey}:${uid}`, 60, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
    };
  }
  try {
    await assertAccountActive(uid);
  } catch (gateErr: unknown) {
    if (gateErr instanceof QuotaError) {
      return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
    }
    throw gateErr;
  }

  // Checked before the id forms any document path (SEC-2026-514).
  if (!isFirestoreId(rawProjectId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  }
  const projectId = rawProjectId;

  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists || !isProjectOwner(snap.data() || {}, uid)) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  return { ok: true, uid, projectId, db };
}
