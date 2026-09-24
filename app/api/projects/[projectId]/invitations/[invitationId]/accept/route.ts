import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminAuth,
  getAdminDb,
  assertAccountActive,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { escapeHtml } from '@/lib/utils';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import { ownDomainVerifyEmailLink } from '@/lib/auth-action-link';
import { buildAddressConfirmationEmail, ADDRESS_CONFIRMATION_SUBJECT } from '@/lib/invitation-email';
import {
  INVITATION_CLOSED_CODE,
  INVITATION_CLOSED_MESSAGE,
  INVITATION_COLLECTION,
  PROJECT_READERS_FIELD,
  effectiveStatus,
  normaliseInvitedEmail,
  type Invitation,
} from '@/lib/invitations';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * Accepting an invitation — roadmap 5.3, and the place the whole phase is
 * decided.
 *
 *   POST → `{ accepted: true, projectId, projectName }`, or one refusal.
 *
 * Four conditions, all of them, and the order matters:
 *
 *   1. **signed in** — a Firebase ID token this server verified;
 *   2. **Terms accepted**, through the existing route: `recordConsent` writes an
 *      append-only `consent_events` row and mirrors the version onto the
 *      profile, and `termsVersionAccepted` is not client-writable
 *      (`firestore.rules`, finding V14). This reads that mirror. There is no
 *      second consent path and this route does not create one;
 *   3. **the account address is confirmed.** A Google sign-in has already proven
 *      control of the mailbox and counts as confirmed. A password account has
 *      proven nothing — anybody can register `someone@their-employer.example` —
 *      so it gets a confirmation mail *at this moment* and no insight until it
 *      is confirmed. **Registration itself does not change**: an account that
 *      never opens an invitation is never asked for anything;
 *   4. **the account address equals the invited address**, both normalised the
 *      same way, and the invitation is open — not expired, not withdrawn, not
 *      already taken by somebody else.
 *
 * **Conditions 1 to 3 are about the caller's own account and are answered
 * before the invitation is read at all.** That is what makes them safe to name:
 * "sign in", "accept the Terms" and "confirm your address" are the same answers
 * for an address nobody ever invited, so none of them says whether an
 * invitation exists.
 *
 * **Condition 4 has exactly one answer** (`INVITATION_CLOSED_MESSAGE`), one
 * code and one status, for every way it can fail: no such invitation, an
 * invitation of another project, an address that does not match, an expired
 * one, a withdrawn one, one already accepted by another account. A route that
 * told those apart would be a probe — the difference between "no such
 * invitation" and "not for you" is precisely the fact that an invitation
 * exists for that address, and it can be iterated. None of the distinctions
 * would change what the reader has to do: ask the owner for a new invitation to
 * the address they signed in with.
 *
 * On acceptance the server writes two things, both through the Admin SDK: the
 * invitation's own record, and the accepting uid into `projects/{id}.readers`.
 * That field is on the project document on purpose — `firestore.rules` can then
 * compare it against `request.auth.uid` on the very document being read, at no
 * extra document lookup, which a rule-side `get()` into this subcollection
 * would not be (and `get()` has produced evaluation errors in the emulator
 * before; the file says so twice). **This route does not change
 * `firestore.rules`.** The read permission that field unlocks is roadmap 5.4,
 * and a rules deploy is a decision with a hand on it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The one answer condition 4 gives, whichever way it failed. */
function closed(): NextResponse {
  return NextResponse.json(
    { error: INVITATION_CLOSED_MESSAGE, code: INVITATION_CLOSED_CODE },
    { status: 403 },
  );
}

/**
 * Who sent this invitation and until when it is open — before it is accepted
 * (UX-148, Sonny 24.09.2026, option B).
 *
 * The page showed nothing before acceptance, so a reader who opened the link
 * later, without the mail, could not tell whose invitation it was. The mail
 * already names the inviter and the expiry to the invited address; this answer
 * gives exactly those two facts, and only to the account that *is* that
 * address, confirmed. Everyone else gets the one refusal `POST` gives, so a
 * forwarded link still tells its holder nothing. The project name stays behind
 * acceptance — it is the fact the mail withholds (`lib/invitation-email.ts`).
 *
 * A read in every sense: nothing is written, and unlike `POST` no confirmation
 * mail is sent for an unconfirmed address — a GET that mails is a mailer.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invitationId: string }> },
) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json(
        { error: 'Sign in with the address this invitation was sent to.', code: 'signin-required' },
        { status: 401 },
      );
    }
    try {
      await assertRateLimit(`invitation-preview:${decodedToken.uid}:${getClientIp(req)}`, 60, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }
    const accountEmail = normaliseInvitedEmail(decodedToken.email);
    if (!accountEmail || decodedToken.email_verified !== true) return closed();

    const { projectId, invitationId } = await params;
    if (!projectId || !invitationId) return closed();
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId) || !isFirestoreId(invitationId)) return closed();

    const { db } = await getAdminDb();
    const snap = await db
      .collection('projects')
      .doc(projectId)
      .collection(INVITATION_COLLECTION)
      .doc(invitationId)
      .get();
    if (!snap.exists) return closed();
    const invitation = (snap.data() || {}) as Partial<Invitation>;
    if (invitation.projectId !== projectId) return closed();
    if (normaliseInvitedEmail(invitation.email) !== accountEmail) return closed();
    if (typeof invitation.expiresAt !== 'string' || typeof invitation.status !== 'string') return closed();
    if (effectiveStatus(invitation as Invitation) !== 'pending') return closed();

    return NextResponse.json({
      invitedBy: String(invitation.invitedBy?.name ?? ''),
      expiresAt: invitation.expiresAt,
    });
  } catch (err: unknown) {
    logger.error('invitation preview failed', {
      route: 'api/projects/invitations/accept',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not open this invitation.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; invitationId: string }> },
) {
  try {
    /* ---------------------------------------------- 1. signed in */
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json(
        { error: 'Sign in with the address this invitation was sent to.', code: 'signin-required' },
        { status: 401 },
      );
    }
    const uid: string = decodedToken.uid;

    try {
      await assertRateLimit(`invitation-accept:${uid}:${getClientIp(req)}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }

    const accountEmail = normaliseInvitedEmail(decodedToken.email);
    if (!accountEmail) {
      return NextResponse.json(
        { error: 'This account has no email address, so no invitation can be matched to it.', code: 'no-account-email' },
        { status: 403 },
      );
    }

    const { projectId, invitationId } = await params;
    if (!projectId || !invitationId) {
      return NextResponse.json({ error: 'Missing invitation.' }, { status: 400 });
    }
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId) || !isFirestoreId(invitationId)) {
      return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 });
    }

    const { db, FieldValue } = await getAdminDb();

    /* ------------------------------------------- 2. Terms accepted */
    // Suspended accounts and a stale acceptance are caught by the existing gate.
    try {
      await assertAccountActive(uid, {
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message, code: 'account-gate' }, { status: gateErr.status });
      }
      throw gateErr;
    }
    // …and a *missing* acceptance is not: `assertAccountActive` grandfathers it
    // on purpose, so that accounts from before consent was recorded are not
    // locked out of their own projects. Reading somebody else's source code is
    // not their own project, so this one is asked for explicitly.
    const profileSnap = await db.collection('users').doc(uid).get();
    const profile = (profileSnap.data() || {}) as { termsVersionAccepted?: unknown };
    if (typeof profile.termsVersionAccepted !== 'string' || profile.termsVersionAccepted === '') {
      return NextResponse.json(
        {
          error: 'Accept the Terms of Service and the Privacy Policy on your account before opening an invitation.',
          code: 'terms-required',
        },
        { status: 403 },
      );
    }

    /* --------------------------------------- 3. confirmed address */
    if (decodedToken.email_verified !== true) {
      // Sent here and only here (roadmap 5.3). It is answered identically for an
      // address nobody invited, so it reveals nothing about any invitation — and
      // it is rate-limited separately, because a route that mails on request is
      // a mailer.
      let sent = false;
      try {
        await assertRateLimit(`invitation-confirm-mail:${uid}`, 3, 60 * 60 * 1000);
        // Firebase issues the one-time code; the link itself points at our own
        // domain (`/auth/action`), not at <project>.firebaseapp.com — roadmap
        // 3.0.9, see lib/auth-action-link.ts.
        const link = ownDomainVerifyEmailLink(
          await (await getAdminAuth()).generateEmailVerificationLink(accountEmail),
        );
        const outcome = await sendTransactionalMail({
          to: accountEmail,
          subject: ADDRESS_CONFIRMATION_SUBJECT,
          label: 'address confirmation',
          uid,
          html: wrapEmailDocument(
            buildAddressConfirmationEmail({ recipient: escapeHtml(accountEmail), link }),
            'Clean-Core.io — confirm your address',
          ),
        });
        sent = outcome.delivered;
      } catch (mailErr: unknown) {
        logger.warn('confirmation mail for an invitation could not be sent', {
          route: 'api/projects/invitations/accept',
          error: errMessage(mailErr),
        });
      }
      return NextResponse.json(
        {
          error: sent
            ? 'Your email address is not confirmed yet. We have just sent a confirmation link to it — open it, sign in again, and then open this invitation.'
            : 'Your email address is not confirmed yet. Confirm it from your account before opening an invitation.',
          code: 'email-unconfirmed',
          confirmationSent: sent,
        },
        { status: 403 },
      );
    }

    /* ------------------------------ 4. the invitation, one answer */
    const invitationRef = db
      .collection('projects')
      .doc(projectId)
      .collection(INVITATION_COLLECTION)
      .doc(invitationId);
    const projectRef = db.collection('projects').doc(projectId);

    const result = await db.runTransaction(async (tx: any) => {
      const [invitationSnap, projectSnap] = await Promise.all([tx.get(invitationRef), tx.get(projectRef)]);
      if (!invitationSnap.exists || !projectSnap.exists) return { ok: false as const };

      const invitation = (invitationSnap.data() || {}) as Partial<Invitation>;
      // A document copied into another project verifies against nothing: the
      // record names the project it was written for, and that is compared with
      // where it was found.
      if (invitation.projectId !== projectId) return { ok: false as const };
      if (normaliseInvitedEmail(invitation.email) !== accountEmail) return { ok: false as const };
      if (typeof invitation.expiresAt !== 'string' || typeof invitation.status !== 'string') {
        return { ok: false as const };
      }

      const status = effectiveStatus(invitation as Invitation);
      const projectName = String((projectSnap.data() || {}).name ?? '');

      if (status === 'accepted') {
        // Opening the same link twice is not a second grant, and it is not a
        // refusal either. Only the account that accepted it sees this.
        return invitation.acceptedBy?.uid === uid
          ? { ok: true as const, projectName, already: true }
          : { ok: false as const };
      }
      if (status !== 'pending') return { ok: false as const };

      const acceptedAt = new Date().toISOString();
      tx.update(invitationRef, {
        status: 'accepted',
        acceptedBy: { uid, email: accountEmail },
        acceptedAt,
        // An acceptance is not a withdrawal; the field stays as it was written.
        revokedAt: invitation.revokedAt ?? null,
      });
      // The reader lands on the project document, where a rule can see it
      // without a second read. `arrayUnion` keeps a repeat acceptance from
      // producing a duplicate entry.
      tx.update(projectRef, { [PROJECT_READERS_FIELD]: FieldValue.arrayUnion(uid) });
      return { ok: true as const, projectName, already: false };
    });

    if (!result.ok) return closed();

    logger.info('invitation accepted', {
      route: 'api/projects/invitations/accept',
      projectId,
      invitationId,
      already: result.already,
    });
    return NextResponse.json({
      accepted: true,
      already: result.already,
      projectId,
      projectName: result.projectName,
    });
  } catch (err: unknown) {
    logger.error('invitation could not be accepted', {
      route: 'api/projects/invitations/accept',
      error: errMessage(err),
    });
    return NextResponse.json({ error: 'Could not open this invitation.' }, { status: 500 });
  }
}
