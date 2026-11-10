import type { Firestore, FieldValue, Transaction } from 'firebase-admin/firestore';
import crypto from 'crypto';
import {
  INVITATION_MAX_OPEN,
  effectiveStatus,
  invitationExpiry,
  isOpen,
  normaliseInvitedEmail,
  type InvitationStatus,
} from '@/lib/invitations';
import { isFirestoreId } from '@/lib/firestore-id';
import { BatchRefusal } from './batch-store';
import { PORTFOLIO_SELECTION_MAX_PROJECTS } from './limits';
import { SELECTION_COLLECTION, idsOfStored, readSelection, readerProjectIds, selectionOfStored } from './selection-store';

/**
 * The e-mail-bound read invitation to a named selection — roadmap 3.0.21 (4),
 * "by the same e-mail-bound read invitation as a project".
 *
 * The same rules as `app/api/projects/[projectId]/invitations` and its accept
 * route, from the same module (`lib/invitations.ts`): the address normalised
 * and bound, the server's clock for both times, a lifetime of 1–90 days
 * (default 14), at most three waiting at once, a 24-byte random id, `create()`
 * and never `set()`, one answer for every way a link does not open, and the
 * accepting account's own **confirmed** address compared with the invited one.
 * The accepted uid goes into `readers` on the selection document, which the
 * overview route re-reads on every request; a withdrawal takes it out again.
 *
 * **What an invitation opens is fixed when it is sent** (owner decision
 * 23.10.2026): it carries `projectIds`, the selection's list at that moment,
 * and accepting writes that list — still filtered to what is in the selection
 * — into `readerScopes[uid]`. Editing the list afterwards
 * (`updateSelectionProjects`) never adds to a scope; removing a project takes
 * it out of every scope and every waiting invitation. Only
 * `releaseSelectionProjects`, the owner's explicit act, widens them.
 *
 * Stored at `portfolio_selections/{id}/invitations/{invitationId}`, Admin SDK
 * only; no rule opens it to a browser.
 */

type AdminDb = Firestore;
type FieldValueT = typeof FieldValue;

export const SELECTION_INVITATIONS = 'invitations';

export interface SelectionInvitation {
  id: string;
  selectionId: string;
  email: string;
  invitedBy: { uid: string; name: string };
  invitedAt: string;
  expiresAt: string;
  status: InvitationStatus;
  acceptedBy: { uid: string; email: string } | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  /** The selection's project ids when the invitation was sent (or last released). */
  projectIds: string[];
}

function invitationsRef(db: AdminDb, selectionId: string) {
  return db.collection(SELECTION_COLLECTION).doc(selectionId).collection(SELECTION_INVITATIONS);
}

/** The owner's selection, or the refusal "not there or not yours" (one answer for both). */
async function ownSelection(db: AdminDb, uid: string, selectionId: string) {
  const selection = await readSelection(db, selectionId);
  if (!selection || selection.ownerId !== uid) throw new BatchRefusal('No such selection.', 404, 'selection-not-found');
  return selection;
}

/** Create the invitation inside the ceiling; the caller mails it and withdraws it if the mail fails. */
export async function createSelectionInvitation(
  db: AdminDb,
  owner: { uid: string; email: string; name: string },
  selectionId: string,
  body: { email?: unknown; expiresInDays?: unknown } | null,
): Promise<SelectionInvitation> {
  const selection = await ownSelection(db, owner.uid, selectionId);
  const email = normaliseInvitedEmail(body?.email);
  if (!email) throw new BatchRefusal('Enter one email address to invite.', 400, 'bad-email');
  if (email === normaliseInvitedEmail(owner.email)) {
    throw new BatchRefusal('This is your own address. You already have access to this selection.', 400, 'self-invite');
  }
  const invitedAt = new Date();
  const invitation: SelectionInvitation = {
    id: crypto.randomBytes(24).toString('base64url'),
    selectionId,
    email,
    invitedBy: { uid: owner.uid, name: owner.name.slice(0, 200) },
    invitedAt: invitedAt.toISOString(),
    expiresAt: invitationExpiry(invitedAt, body?.expiresInDays).toISOString(),
    status: 'pending',
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
    projectIds: selection.projectIds,
  };
  const selectionRef = db.collection(SELECTION_COLLECTION).doc(selectionId);
  const ref = invitationsRef(db, selectionId).doc(invitation.id);
  await db.runTransaction(async (tx: Transaction) => {
    const current = await tx.get(selectionRef);
    if (!current.exists || (current.data() || {}).ownerId !== owner.uid) {
      throw new BatchRefusal('No such selection.', 404, 'selection-not-found');
    }
    // The snapshot is the list as the transaction reads it, not as it was a moment earlier.
    invitation.projectIds = idsOfStored((current.data() || {}).projectIds);
    const existing = await tx.get(ref.parent.where('expiresAt', '>', invitedAt.toISOString()));
    const open = existing.docs.filter((d: { data: () => Record<string, unknown> }) =>
      isOpen(d.data() as { status: InvitationStatus; expiresAt: string }, invitedAt),
    ).length;
    if (open >= INVITATION_MAX_OPEN) {
      throw new BatchRefusal(
        `This selection already has ${INVITATION_MAX_OPEN} invitations waiting to be accepted. Withdraw one before sending another.`,
        409,
        'too-many-open',
      );
    }
    tx.create(ref, invitation as unknown as Record<string, unknown>);
  });
  return invitation;
}

/** Withdraw an invitation — waiting or accepted. An accepted reader loses the read at once. */
export async function withdrawSelectionInvitation(
  db: AdminDb,
  FieldValue: FieldValueT,
  uid: string,
  selectionId: string,
  invitationId: string,
): Promise<void> {
  await ownSelection(db, uid, selectionId);
  if (!isFirestoreId(invitationId)) throw new BatchRefusal('No such invitation.', 404, 'invitation-not-found');
  const selectionRef = db.collection(SELECTION_COLLECTION).doc(selectionId);
  const ref = invitationsRef(db, selectionId).doc(invitationId);
  await db.runTransaction(async (tx: Transaction) => {
    const [snap, sel] = await Promise.all([tx.get(ref), tx.get(selectionRef)]);
    if (!snap.exists) throw new BatchRefusal('No such invitation.', 404, 'invitation-not-found');
    const data = (snap.data() || {}) as Partial<SelectionInvitation>;
    tx.update(ref, { status: 'revoked', revokedAt: new Date().toISOString() });
    const reader = data.status === 'accepted' ? data.acceptedBy?.uid : null;
    if (reader) {
      const { readerScopes } = selectionOfStored(selectionId, sel.exists ? sel.data() || {} : {});
      delete readerScopes[reader];
      tx.update(selectionRef, { readers: FieldValue.arrayRemove(reader), readerScopes });
    }
  });
}

/** A waiting invitation's snapshot, still in the selection (none stored: the list as it stands). */
function waitingProjectIds(invitation: Partial<SelectionInvitation>, projectIds: string[]): string[] {
  if (!Array.isArray(invitation.projectIds)) return projectIds;
  const snapshot = new Set(idsOfStored(invitation.projectIds));
  return projectIds.filter((id) => snapshot.has(id));
}

/**
 * The owner's list: who is still invited, who reads, and which projects each
 * of them sees. `unreleased` are the projects of the selection that at least
 * one of them does not see — added after their invitation. Addresses only for
 * the owner.
 */
export async function selectionSharing(db: AdminDb, uid: string, selectionId: string, now: Date = new Date()) {
  const selection = await ownSelection(db, uid, selectionId);
  const snap = await invitationsRef(db, selectionId).get();
  const all = snap.docs.map((d: { id: string; data: () => Record<string, unknown> }) => ({ ...(d.data() as unknown as SelectionInvitation), id: d.id }));
  const waiting = all
    .filter((i: SelectionInvitation) => effectiveStatus(i, now) === 'pending')
    .map((i: SelectionInvitation) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt, projectIds: waitingProjectIds(i, selection.projectIds) }));
  const readers = all
    .filter((i: SelectionInvitation) => i.status === 'accepted' && i.acceptedBy && selection.readers.includes(i.acceptedBy.uid))
    .map((i: SelectionInvitation) => ({
      id: i.id,
      email: i.acceptedBy!.email,
      acceptedAt: i.acceptedAt,
      projectIds: readerProjectIds(selection, i.acceptedBy!.uid),
    }));
  const unreleased = selection.projectIds.filter((id) => [...waiting, ...readers].some((x) => !x.projectIds.includes(id)));
  return { projectIds: selection.projectIds, waiting, readers, unreleased };
}

type InvitationDoc = { id: string; ref: unknown; data: () => Record<string, unknown> };

/**
 * Replace the owner's list of projects in a selection — the owner's own
 * projects only; an id that is not theirs is left out.
 *
 * Nothing is added to what a reader or a waiting invitation sees: a project
 * added here stays invisible to them until `releaseSelectionProjects`. A
 * project taken out leaves every reader's scope and every invitation's
 * snapshot in the same transaction, so it is gone for readers at once and
 * putting it back does not return it to them. A reader accepted before scopes
 * existed gets the list as it stood written down first.
 */
export async function updateSelectionProjects(db: AdminDb, uid: string, selectionId: string, raw: unknown): Promise<{ projectIds: string[] }> {
  await ownSelection(db, uid, selectionId);
  const list = Array.isArray((raw as { projectIds?: unknown } | null)?.projectIds) ? ((raw as { projectIds: unknown[] }).projectIds) : [];
  const wanted = [...new Set(list.filter((x): x is string => typeof x === 'string' && isFirestoreId(x)))];
  if (wanted.length === 0) throw new BatchRefusal('Choose at least one project.', 400, 'selection-empty');
  if (wanted.length > PORTFOLIO_SELECTION_MAX_PROJECTS) {
    throw new BatchRefusal(`A selection holds at most ${PORTFOLIO_SELECTION_MAX_PROJECTS} projects.`, 400, 'selection-too-large');
  }
  const snaps = await db.getAll(...wanted.map((id) => db.collection('projects').doc(id)), { fieldMask: ['userId'] });
  const own = new Set(
    snaps
      .filter((s: { exists: boolean; data: () => Record<string, unknown> | undefined }) => s.exists && (s.data() || {}).userId === uid)
      .map((s: { id: string }) => s.id),
  );
  const projectIds = wanted.filter((id) => own.has(id));
  if (projectIds.length === 0) throw new BatchRefusal('None of these projects is yours.', 400, 'selection-empty');
  const selectionRef = db.collection(SELECTION_COLLECTION).doc(selectionId);
  await db.runTransaction(async (tx: Transaction) => {
    const [sel, invitations] = await Promise.all([tx.get(selectionRef), tx.get(invitationsRef(db, selectionId))]);
    if (!sel.exists || (sel.data() || {}).ownerId !== uid) throw new BatchRefusal('No such selection.', 404, 'selection-not-found');
    const before = selectionOfStored(selectionId, sel.data() || {});
    const kept = new Set(projectIds);
    const readerScopes: Record<string, string[]> = {};
    for (const reader of before.readers) readerScopes[reader] = readerProjectIds(before, reader).filter((id) => kept.has(id));
    for (const doc of invitations.docs as InvitationDoc[]) {
      const data = doc.data() as Partial<SelectionInvitation>;
      if (data.status === 'revoked') continue;
      const snapshot = waitingProjectIds(data, before.projectIds).filter((id) => kept.has(id));
      tx.update(doc.ref as never, { projectIds: snapshot });
    }
    tx.update(selectionRef, { projectIds, readerScopes });
  });
  return { projectIds };
}

/**
 * The owner's explicit act: every current reader and every waiting
 * invitation of this selection now sees all its projects.
 */
export async function releaseSelectionProjects(db: AdminDb, uid: string, selectionId: string): Promise<{ projectIds: string[] }> {
  await ownSelection(db, uid, selectionId);
  const selectionRef = db.collection(SELECTION_COLLECTION).doc(selectionId);
  return db.runTransaction(async (tx: Transaction) => {
    const [sel, invitations] = await Promise.all([tx.get(selectionRef), tx.get(invitationsRef(db, selectionId))]);
    if (!sel.exists || (sel.data() || {}).ownerId !== uid) throw new BatchRefusal('No such selection.', 404, 'selection-not-found');
    const selection = selectionOfStored(selectionId, sel.data() || {});
    const readerScopes: Record<string, string[]> = {};
    for (const reader of selection.readers) readerScopes[reader] = [...selection.projectIds];
    for (const doc of invitations.docs as InvitationDoc[]) {
      const data = doc.data() as Partial<SelectionInvitation>;
      if (data.status === 'revoked') continue;
      tx.update(doc.ref as never, { projectIds: [...selection.projectIds] });
    }
    tx.update(selectionRef, { readerScopes });
    return { projectIds: selection.projectIds };
  });
}

/** The one answer for every way a link does not open. */
export const SELECTION_INVITATION_CLOSED =
  'This invitation cannot be opened with this account. Ask the person who shared the portfolio to send a new invitation to the address you signed in with.';

/**
 * Accept: the invitation exists, belongs to this selection, is for this
 * confirmed address and is open. Everything else is `null` — one answer.
 */
export async function acceptSelectionInvitation(
  db: AdminDb,
  FieldValue: FieldValueT,
  account: { uid: string; email: string },
  selectionId: string,
  invitationId: string,
): Promise<{ name: string; already: boolean } | null> {
  if (!isFirestoreId(selectionId) || !isFirestoreId(invitationId)) return null;
  const selectionRef = db.collection(SELECTION_COLLECTION).doc(selectionId);
  const ref = invitationsRef(db, selectionId).doc(invitationId);
  return db.runTransaction(async (tx: Transaction) => {
    const [inv, sel] = await Promise.all([tx.get(ref), tx.get(selectionRef)]);
    if (!inv.exists || !sel.exists) return null;
    const invitation = (inv.data() || {}) as Partial<SelectionInvitation>;
    if (invitation.selectionId !== selectionId) return null;
    if (normaliseInvitedEmail(invitation.email) !== account.email) return null;
    if (typeof invitation.expiresAt !== 'string' || typeof invitation.status !== 'string') return null;
    const selection = selectionOfStored(selectionId, sel.data() || {});
    const name = selection.name;
    const status = effectiveStatus(invitation as SelectionInvitation);
    if (status === 'accepted') return invitation.acceptedBy?.uid === account.uid ? { name, already: true } : null;
    if (status !== 'pending') return null;
    // The scope is the invitation's snapshot, still in the selection. An
    // invitation sent before snapshots existed carries none; the list could not
    // be edited then, so the list as it stands is that snapshot.
    const current = new Set(selection.projectIds);
    const snapshot = Array.isArray(invitation.projectIds) ? idsOfStored(invitation.projectIds) : selection.projectIds;
    const already = selection.readers.includes(account.uid) ? readerProjectIds(selection, account.uid) : [];
    const readerScopes = {
      ...selection.readerScopes,
      [account.uid]: [...new Set([...already, ...snapshot.filter((id) => current.has(id))])],
    };
    tx.update(ref, { status: 'accepted', acceptedBy: { uid: account.uid, email: account.email }, acceptedAt: new Date().toISOString() });
    tx.update(selectionRef, { readers: FieldValue.arrayUnion(account.uid), readerScopes });
    return { name, already: false };
  });
}

/** Who invited and until when — only to the invited, confirmed address; `null` otherwise. */
export async function previewSelectionInvitation(
  db: AdminDb,
  accountEmail: string,
  selectionId: string,
  invitationId: string,
): Promise<{ invitedBy: string; expiresAt: string } | null> {
  if (!isFirestoreId(selectionId) || !isFirestoreId(invitationId)) return null;
  const snap = await invitationsRef(db, selectionId).doc(invitationId).get();
  if (!snap.exists) return null;
  const invitation = (snap.data() || {}) as Partial<SelectionInvitation>;
  if (invitation.selectionId !== selectionId) return null;
  if (normaliseInvitedEmail(invitation.email) !== accountEmail) return null;
  if (typeof invitation.expiresAt !== 'string' || typeof invitation.status !== 'string') return null;
  if (effectiveStatus(invitation as SelectionInvitation) !== 'pending') return null;
  return { invitedBy: String(invitation.invitedBy?.name ?? ''), expiresAt: invitation.expiresAt };
}
