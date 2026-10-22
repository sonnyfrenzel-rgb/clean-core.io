import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import { BatchRefusal } from '@/lib/portfolio/batch-store';
import { deleteSelection } from '@/lib/portfolio/selection-store';

/**
 * DELETE /api/portfolio/selections/{selectionId} — roadmap 3.0.21.
 *
 * Removes the named selection and every invitation to it; the projects stay.
 * A reader of it reads nothing from that moment on. Owner only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ selectionId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-upload', perHour: 120, mode: 'manage' });
    if (!gate.ok) return gate.response;
    const { selectionId } = await params;
    await deleteSelection(gate.db, gate.uid, String(selectionId ?? ''));
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio selection could not be deleted', { route: 'api/portfolio/selections/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not delete the selection.' }, { status: 500 });
  }
}
