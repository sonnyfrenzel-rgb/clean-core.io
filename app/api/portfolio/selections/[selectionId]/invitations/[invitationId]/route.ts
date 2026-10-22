import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { INVITATION_SEND_RATE_LIMIT } from '@/lib/invitation-owner-gate';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import { BatchRefusal } from '@/lib/portfolio/batch-store';
import { withdrawSelectionInvitation } from '@/lib/portfolio/selection-invitations';

/**
 * DELETE — withdraw an invitation to a selection, waiting or accepted
 * (roadmap 3.0.21 (4)). An accepted reader loses the read with this request:
 * the overview re-reads `readers` on every request. Owner only; the budget of
 * inviting, as for projects (withdrawing is the other half of the same act).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ selectionId: string; invitationId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'invitations-withdraw', perHour: INVITATION_SEND_RATE_LIMIT, mode: 'manage' });
    if (!gate.ok) return gate.response;
    const { selectionId, invitationId } = await params;
    await withdrawSelectionInvitation(gate.db, gate.FieldValue, gate.uid, String(selectionId ?? ''), String(invitationId ?? ''));
    return NextResponse.json({ withdrawn: true });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio invitation could not be withdrawn', { route: 'api/portfolio/selections/invitations/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not withdraw this invitation.' }, { status: 500 });
  }
}
