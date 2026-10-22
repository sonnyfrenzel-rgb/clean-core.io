import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import { openPortfolioRoute, readPortfolioAccess } from '@/lib/portfolio/access-server';

/**
 * GET /api/portfolio/access → `{ open, reason, message }` — roadmap 3.0.21.
 *
 * Whether this account may use the portfolio, and if not why, in the sentence
 * the entry shows (own key stored and tested; `lib/portfolio/access.ts`). The
 * answer decides what the page draws; every portfolio route asks the same
 * question again for itself.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const gate = await openPortfolioRoute(req, { bucket: 'portfolio-read', perHour: 600, mode: 'report' });
    if (!gate.ok) return gate.response;
    return NextResponse.json(await readPortfolioAccess(gate.db, gate.uid, gate.isAdmin));
  } catch (err: unknown) {
    logger.error('portfolio access could not be read', { route: 'api/portfolio/access', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read whether the portfolio is open.' }, { status: 500 });
  }
}
