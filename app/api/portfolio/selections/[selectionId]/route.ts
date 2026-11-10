import { NextRequest, NextResponse } from 'next/server';
import { isFirestoreId } from '@/lib/firestore-id';
import { logger, errMessage } from '@/lib/logger';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import { BatchRefusal } from '@/lib/portfolio/batch-store';
import { deleteSelection } from '@/lib/portfolio/selection-store';
import { releaseSelectionProjects, updateSelectionProjects } from '@/lib/portfolio/selection-invitations';

/**
 * /api/portfolio/selections/{selectionId} — roadmap 3.0.21.
 *
 *   PATCH `{ projectIds }`        → `{ projectIds }`: the owner's new list. A
 *                                   project added is not visible to readers;
 *                                   one removed is gone for them at once.
 *   PATCH `{ action: 'release' }` → `{ projectIds }`: the owner shares every
 *                                   project of the list with the current
 *                                   readers and waiting invitations (owner
 *                                   decision 23.10.2026: sharing never
 *                                   extends silently).
 *   DELETE                        → removes the named selection and every
 *                                   invitation to it; the projects stay. A
 *                                   reader of it reads nothing from that
 *                                   moment on.
 *
 * Owner only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ selectionId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-upload', perHour: 120 });
    if (!gate.ok) return gate.response;
    const { selectionId } = await params;
    if (!isFirestoreId(selectionId)) return NextResponse.json({ error: 'No such selection.' }, { status: 404 });
    const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
    const answer =
      body?.action === 'release'
        ? await releaseSelectionProjects(gate.db, gate.uid, selectionId)
        : await updateSelectionProjects(gate.db, gate.uid, selectionId, body);
    return NextResponse.json(answer);
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio selection could not be changed', { route: 'api/portfolio/selections/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not change the selection.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ selectionId: string }> }) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-upload', perHour: 120, mode: 'manage' });
    if (!gate.ok) return gate.response;
    const { selectionId } = await params;
    if (!isFirestoreId(selectionId)) return NextResponse.json({ error: 'No such selection.' }, { status: 404 });
    await deleteSelection(gate.db, gate.uid, selectionId);
    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio selection could not be deleted', { route: 'api/portfolio/selections/id', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not delete the selection.' }, { status: 500 });
  }
}
