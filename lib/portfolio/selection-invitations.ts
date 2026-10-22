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
import { SELECTION_COLLECTION, readSelection } from './selection-store';

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
  await ownSelection(db, owner.uid, selectionId);
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
  };
  const selectionRef = db.collection(SELECTION_COLLECTION).doc(selectionId);
  const ref = invitationsRef(db, selectionId).doc(invitation.id);
  await db.runTransaction(async (tx: Transaction) => {
    const current = await tx.get(selectionRef);
    if (!current.exists || (current.data() || {}).ownerId !== owner.uid) {
      throw new BatchRefusal('No such selection.', 404, 'selection-not-found');
    }
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
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BatchRefusal('No such invitation.', 404, 'invitation-not-found');
    const data = (snap.data() || {}) as Partial<SelectionInvitation>;
    tx.update(ref, { status: 'revoked', revokedAt: new Date().toISOString() });
    const reader = data.status === 'accepted' ? data.acceptedBy?.uid : null;
    if (reader) tx.update(selectionRef, { readers: FieldValue.arrayRemove(reader) });
  });
}

/** The owner's list: who is still invited, who reads. Addresses only for the owner. */
export async function selectionSharing(db: AdminDb, uid: string, selectionId: string, now: Date = new Date()) {
  await ownSelection(db, uid, selectionId);
  const snap = await invitationsRef(db, selectionId).get();
  const all = snap.docs.map((d: { id: string; data: () => Record<string, unknown> }) => ({ ...(d.data() as unknown as SelectionInvitation), id: d.id }));
  return {
    waiting: all
      .filter((i: SelectionInvitation) => effectiveStatus(i, now) === 'pending')
      .map((i: SelectionInvitation) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt })),
    readers: all
      .filter((i: SelectionInvitation) => i.status === 'accepted' && i.acceptedBy)
      .map((i: SelectionInvitation) => ({ id: i.id, email: i.acceptedBy!.email, acceptedAt: i.acceptedAt })),
  };
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
    const name = String((sel.data() || {}).name ?? '');
    const status = effectiveStatus(invitation as SelectionInvitation);
    if (status === 'accepted') return invitation.acceptedBy?.uid === account.uid ? { name, already: true } : null;
    if (status !== 'pending') return null;
    tx.update(ref, { status: 'accepted', acceptedBy: { uid: account.uid, email: account.email }, acceptedAt: new Date().toISOString() });
    tx.update(selectionRef, { readers: FieldValue.arrayUnion(account.uid) });
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
