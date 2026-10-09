import { NextResponse } from 'next/server';
import { getAdminDb, assertAccountActive, QuotaError } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { isProjectOwner } from '@/lib/project-readers';
import { isFirestoreId } from '@/lib/firestore-id';
import { INVITATION_COLLECTION } from '@/lib/invitations';
import { openInvitationsOf } from '@/lib/open-invitations';
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

/**
 * The budget per account and hour, per route.
 *
 * Withdrawing writes to an invitation and to the journal, so it gets the budget
 * inviting has (`POST /api/projects/{id}/invitations`: 20 an hour) rather than
 * the reading budget it used to share the number with — a withdrawal is the
 * other half of the same act, and SECURITY.md §3.7 names both halves as limited
 * (owner decision 02.10.2026). Reading the list keeps its own, larger budget, so
 * looking never uses up what a withdrawal needs.
 */
export const INVITATION_SEND_RATE_LIMIT = 20;

export const INVITATION_RATE_LIMITS = {
  'invitations-list': 60,
  'invitations-withdraw': INVITATION_SEND_RATE_LIMIT,
} as const;

export async function openInvitationsAsOwner(
  uid: string,
  rawProjectId: unknown,
  rateKey: keyof typeof INVITATION_RATE_LIMITS,
): Promise<OwnerGate> {
  try {
    await assertRateLimit(`${rateKey}:${uid}`, INVITATION_RATE_LIMITS[rateKey], 60 * 60 * 1000);
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

/** Documents one page of {@link readOpenInvitations} reads. */
export const OPEN_INVITATIONS_PAGE_SIZE = 500;
/** Pages it reads at most: a bound on the reads of one GET, far above any real project. */
export const OPEN_INVITATIONS_MAX_PAGES = 20;

/**
 * The open invitations of a project, read page by page.
 *
 * Only invitations that have not expired are read — the accepted, withdrawn
 * and expired ones accumulate for the life of the project, and `expiresAt` is
 * an ISO string, so the range is in time order (one field, no composite
 * index). The read used to stop after one page of 500 and filter afterwards:
 * accepted and withdrawn invitations that expire sooner than a pending one
 * could fill that page and cut the pending one off the owner's list (QA review
 * of dd8e996, 9703f5e20b75). Filtering by `status` in the query would need a
 * composite index (equality plus a range on another field), so the pages are
 * walked in `expiresAt` order instead, until one comes back short, with
 * {@link OPEN_INVITATIONS_MAX_PAGES} as the ceiling on reads.
 */
export async function readOpenInvitations(
  db: AdminDb,
  projectId: string,
  now: Date = new Date(),
  pageSize: number = OPEN_INVITATIONS_PAGE_SIZE,
  maxPages: number = OPEN_INVITATIONS_MAX_PAGES,
) {
  const base = db
    .collection('projects').doc(projectId)
    .collection(INVITATION_COLLECTION)
    .where('expiresAt', '>', now.toISOString())
    .orderBy('expiresAt');
  type Snap = Awaited<ReturnType<typeof base.get>>;
  const docs: Snap['docs'] = [];
  let last: Snap['docs'][number] | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const snap: Snap = await (last ? base.startAfter(last) : base).limit(pageSize).get();
    docs.push(...snap.docs);
    if (snap.docs.length < pageSize) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return openInvitationsOf(docs, projectId, now);
}
