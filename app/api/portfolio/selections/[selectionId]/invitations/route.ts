import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { escapeHtml } from '@/lib/utils';
import { APP_BASE_URL } from '@/lib/constants';
import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import { invitationNotSentMessage } from '@/lib/invitations';
import { INVITATION_SEND_RATE_LIMIT } from '@/lib/invitation-owner-gate';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import { BatchRefusal } from '@/lib/portfolio/batch-store';
import {
  buildPortfolioInvitationEmail,
  portfolioInvitationLinkPath,
  PORTFOLIO_INVITATION_SUBJECT,
} from '@/lib/portfolio/invitation-email';
import { createSelectionInvitation, SELECTION_INVITATIONS, selectionSharing } from '@/lib/portfolio/selection-invitations';
import { SELECTION_COLLECTION } from '@/lib/portfolio/selection-store';

/**
 * Inviting one address to read a named selection — roadmap 3.0.21 (4).
 *
 *   GET                          → `{ waiting, readers }` — the owner's list.
 *   POST `{ email, expiresInDays? }` → `{ invitation }`, created and mailed.
 *
 * The properties of the project invitation (`app/api/projects/[projectId]/
 * invitations/route.ts`), kept the same way: nothing on the document comes
 * from the body but the address and at most a shorter lifetime; created with
 * `create()`; at most three waiting; a mail that did not go out withdraws its
 * invitation in the same request. Sending shares the account's mail budget
 * with project invitations (`invitations:{uid}`, 20 an hour).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminDb = Awaited<ReturnType<typeof import('@/lib/firebase-admin').getAdminDb>>['db'];

async function inviterName(db: AdminDb, uid: string, fallback: string): Promise<string> {
  try {
    const data = ((await db.collection('users').doc(uid).get()).data() || {}) as { firstName?: string; lastName?: string; email?: string };
    const name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    if (name) return name.slice(0, 200);
    if (typeof data.email === 'string' && data.email) return data.email.slice(0, 200);
  } catch {
    /* named by the token's address */
  }
  return (fallback || uid).slice(0, 200);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ selectionId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-read', perHour: 600, mode: 'manage' });
    if (!gate.ok) return gate.response;
    const { selectionId } = await params;
    return NextResponse.json(await selectionSharing(gate.db, gate.uid, String(selectionId ?? '')));
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio sharing list could not be read', { route: 'api/portfolio/selections/invitations', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read who this selection is shared with.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ selectionId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'invitations', perHour: INVITATION_SEND_RATE_LIMIT });
    if (!gate.ok) return gate.response;
    const { selectionId } = await params;
    const body = (await req.json().catch(() => null)) as { email?: unknown; expiresInDays?: unknown } | null;
    const invitation = await createSelectionInvitation(
      gate.db,
      { uid: gate.uid, email: gate.email, name: await inviterName(gate.db, gate.uid, gate.email) },
      String(selectionId ?? ''),
      body,
    );

    const outcome = await sendTransactionalMail({
      to: invitation.email,
      subject: PORTFOLIO_INVITATION_SUBJECT,
      label: 'portfolio invitation',
      html: wrapEmailDocument(
        buildPortfolioInvitationEmail({
          inviterName: escapeHtml(invitation.invitedBy.name),
          recipient: escapeHtml(invitation.email),
          link: `${APP_BASE_URL}${portfolioInvitationLinkPath(invitation.selectionId, invitation.id)}`,
          expires: new Date(invitation.expiresAt).toUTCString().slice(5, 16),
        }),
        'Clean-Core.io — invitation',
      ),
    });
    if (!outcome.delivered) {
      const withdrawn = await gate.db
        .collection(SELECTION_COLLECTION)
        .doc(invitation.selectionId)
        .collection(SELECTION_INVITATIONS)
        .doc(invitation.id)
        .update({ status: 'revoked', revokedAt: new Date().toISOString() })
        .then(
          () => true,
          (e: unknown) => {
            const code = (e as { code?: unknown } | null)?.code;
            if (code === 5 || code === 'not-found') return true;
            logger.error('portfolio invitation could not be withdrawn after a failed send', {
              route: 'api/portfolio/selections/invitations',
              error: errMessage(e),
            });
            return false;
          },
        );
      return NextResponse.json(
        { error: invitationNotSentMessage(outcome.detail, withdrawn), code: outcome.reason },
        { status: outcome.reason === 'not-configured' ? 503 : 502 },
      );
    }
    return NextResponse.json({ invitation: { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt } }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio invitation could not be created', { route: 'api/portfolio/selections/invitations', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not create this invitation.' }, { status: 500 });
  }
}
