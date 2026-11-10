import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied, mfaRefusal } from '@/lib/firebase-admin';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { openPortfolioRoute, readPortfolioAccess } from '@/lib/portfolio/access-server';
import { PORTFOLIO_CLOSED_CODE } from '@/lib/portfolio/access';
import { mayReadSelection, overviewOfAll, overviewOfSelection, readSelection } from '@/lib/portfolio/selection-store';

/**
 * The aggregated view — roadmap 3.0.21 (2).
 *
 *   GET                       → the overview of all the account's projects.
 *   GET ?selection={id}       → the overview of one named selection.
 *
 * Answer: `{ view, openable, truncated, role }`. Read-only in every sense: it
 * writes nothing, signs nothing and stores nothing — the overview is computed
 * from each project's signed run on every request (`lib/portfolio/aggregate.ts`).
 *
 * Who reads what:
 *   - **all projects** — the owner, with the own key stored and tested;
 *   - **a selection** — its owner (same gate), or an account that accepted an
 *     invitation to it. A reader needs no own key: reading spends nothing and
 *     calls no model. A suspended account reads nothing, as everywhere.
 * Any other caller gets the same 404 as for a selection that does not exist.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const selectionId = new URL(req.url).searchParams.get('selection');
    if (!selectionId) {
      const gate = await openPortfolioRoute(req, { bucket: 'portfolio-view', perHour: 120 });
      if (!gate.ok) return gate.response;
      return NextResponse.json({ ...(await overviewOfAll(gate.db, gate.uid)), role: 'owner' });
    }

    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaRefusal(mfaErr);
      return NextResponse.json({ error: q.message || 'Multi-factor authentication required.' }, { status: q.status || 403 });
    }
    try {
      await assertRateLimit(`portfolio-view:${decodedToken.uid}`, 120, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }
    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return inactive;

    const { db } = await getAdminDb();
    const selection = await readSelection(db, selectionId);
    const role = selection ? mayReadSelection(selection, decodedToken.uid) : null;
    if (!selection || !role) return NextResponse.json({ error: 'No such selection.' }, { status: 404 });
    if (role === 'owner') {
      const access = await readPortfolioAccess(db, decodedToken.uid, decodedToken.admin === true);
      if (!access.open) return NextResponse.json({ error: access.message, code: PORTFOLIO_CLOSED_CODE }, { status: 403 });
    }
    return NextResponse.json({ ...(await overviewOfSelection(db, selection, decodedToken.uid)), role, name: selection.name });
  } catch (err: unknown) {
    logger.error('portfolio overview could not be read', { route: 'api/portfolio/view', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the overview.' }, { status: 500 });
  }
}
