import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminAuth, getAdminDb, assertAccountActive, QuotaError } from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { escapeHtml } from '@/lib/utils';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import { ownDomainVerifyEmailLink } from '@/lib/auth-action-link';
import { buildAddressConfirmationEmail, ADDRESS_CONFIRMATION_SUBJECT } from '@/lib/invitation-email';
import { INVITATION_CLOSED_CODE, normaliseInvitedEmail } from '@/lib/invitations';
import {
  acceptSelectionInvitation,
  previewSelectionInvitation,
  SELECTION_INVITATION_CLOSED,
} from '@/lib/portfolio/selection-invitations';

/**
 * Accepting an invitation to read a portfolio overview — roadmap 3.0.21 (4).
 *
 *   GET  → `{ invitedBy, expiresAt }` for the invited, confirmed address only.
 *   POST → `{ accepted, selectionId, name }`, or one refusal.
 *
 * The conditions of the project accept route
 * (`app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts`),
 * in its order: signed in; Terms accepted; the account's own address
 * confirmed (a password account is sent a confirmation, rate-limited); and the
 * address equal to the invited one on an open invitation of this selection.
 * The first three concern only the caller's own account and are answered
 * before the invitation is read; the fourth has exactly one answer, whichever
 * way it failed, so a link cannot be used to learn whether an invitation
 * exists or for whom. No own model key is asked for: reading spends nothing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function closed(): NextResponse {
  return NextResponse.json({ error: SELECTION_INVITATION_CLOSED, code: INVITATION_CLOSED_CODE }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ selectionId: string; invitationId: string }> }) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Sign in with the address this invitation was sent to.', code: 'signin-required' }, { status: 401 });
    }
    try {
      await assertRateLimit(`invitation-preview:${decodedToken.uid}:${getClientIp(req)}`, 60, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }
    try {
      await assertAccountActive(decodedToken.uid, { isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) return NextResponse.json({ error: gateErr.message, code: 'account-gate' }, { status: gateErr.status });
      throw gateErr;
    }
    const accountEmail = normaliseInvitedEmail(decodedToken.email);
    if (!accountEmail || decodedToken.email_verified !== true) return closed();
    const { selectionId, invitationId } = await params;
    const { db } = await getAdminDb();
    const preview = await previewSelectionInvitation(db, accountEmail, String(selectionId ?? ''), String(invitationId ?? ''));
    return preview ? NextResponse.json(preview) : closed();
  } catch (err: unknown) {
    logger.error('portfolio invitation preview failed', { route: 'api/portfolio/invitations/accept', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not open this invitation.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ selectionId: string; invitationId: string }> }) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Sign in with the address this invitation was sent to.', code: 'signin-required' }, { status: 401 });
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
      return NextResponse.json({ error: 'This account has no email address, so no invitation can be matched to it.', code: 'no-account-email' }, { status: 403 });
    }

    const { db, FieldValue } = await getAdminDb();
    const profile = ((await db.collection('users').doc(uid).get()).data() || {}) as { termsVersionAccepted?: unknown };
    const noAcceptance = typeof profile.termsVersionAccepted !== 'string' || profile.termsVersionAccepted === '';
    const termsRequired = NextResponse.json(
      { error: 'Accept the Terms of Service and the Privacy Policy on your account before opening an invitation.', code: 'terms-required' },
      { status: 403 },
    );
    try {
      await assertAccountActive(uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        const suspended = /suspended/i.test(gateErr.message);
        return noAcceptance && !suspended
          ? termsRequired
          : NextResponse.json({ error: gateErr.message, code: 'account-gate' }, { status: gateErr.status });
      }
      throw gateErr;
    }
    if (noAcceptance) return termsRequired;

    if (decodedToken.email_verified !== true) {
      let sent = false;
      try {
        await assertRateLimit(`invitation-confirm-mail:${uid}`, 3, 60 * 60 * 1000);
        const link = ownDomainVerifyEmailLink(await (await getAdminAuth()).generateEmailVerificationLink(accountEmail));
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
        logger.warn('confirmation mail for a portfolio invitation could not be sent', {
          route: 'api/portfolio/invitations/accept',
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

    const { selectionId, invitationId } = await params;
    const result = await acceptSelectionInvitation(db, FieldValue, { uid, email: accountEmail }, String(selectionId ?? ''), String(invitationId ?? ''));
    if (!result) return closed();
    logger.info('portfolio invitation accepted', { route: 'api/portfolio/invitations/accept', already: result.already });
    return NextResponse.json({ accepted: true, already: result.already, selectionId, name: result.name });
  } catch (err: unknown) {
    logger.error('portfolio invitation could not be accepted', { route: 'api/portfolio/invitations/accept', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not open this invitation.' }, { status: 500 });
  }
}
