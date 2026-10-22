import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { openPortfolioRoute } from '@/lib/portfolio/access-server';
import { BatchRefusal } from '@/lib/portfolio/batch-store';
import { checkSelectionBody, createSelection, selectionsOf } from '@/lib/portfolio/selection-store';

/**
 * Named selections — roadmap 3.0.21 (2): "a named selection (a list of
 * project ids, nothing written onto runs)".
 *
 *   GET                         → `{ selections }`, the account's own.
 *   POST `{ name, projectIds }` → `{ selection }`; ids that are not the
 *                                 caller's own projects are left out.
 *
 * Owner only, own key stored and tested. Written through the Admin SDK only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-read', perHour: 600 });
    if (!gate.ok) return gate.response;
    const selections = (await selectionsOf(gate.db, gate.uid)).map((s) => ({
      id: s.id,
      name: s.name,
      projectIds: s.projectIds,
      createdAt: s.createdAt,
      readers: s.readers.length,
    }));
    return NextResponse.json({ selections });
  } catch (err: unknown) {
    logger.error('portfolio selections could not be read', { route: 'api/portfolio/selections', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the selections.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-upload', perHour: 120 });
    if (!gate.ok) return gate.response;
    const body = await req.json().catch(() => null);
    const selection = await createSelection(gate.db, gate.uid, checkSelectionBody(body));
    return NextResponse.json({ selection: { ...selection, readers: 0 } }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof BatchRefusal) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    logger.error('portfolio selection could not be created', { route: 'api/portfolio/selections', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not save the selection.' }, { status: 500 });
  }
}
