import { NextRequest, NextResponse } from 'next/server';
import { mfaRefusal, verifyRequestAuth, assertMfaSatisfied, assertAccountActive, getAdminDb, QuotaError } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger, errMessage } from '@/lib/logger';
import { withStoredArtefacts } from '@/lib/project-artefact-store';
import { toHomeRow, HOME_ROW_KEYS, type HomeRow } from '@/lib/home-rows';
import type { Project } from '@/lib/types';

/**
 * GET → the rows of "My workspace" for every project this account owns, up to `MAX_ROWS`; past it the answer says
 * `truncated` and the list tells the reader (AB-14b, H-O9).
 *
 * The list used to read the newest 25 project documents in the browser — `limit(25)` — so the 26th was on no page and
 * no search found it, and every row it did show brought its whole source code along. Here the server reads every
 * project the account owns, fills in the artefacts stored beside it (the phase contract reads them), and answers one
 * lean row per project (`lib/home-rows.ts`): no source, no artefact, no model text. Search, filters and sort then run
 * over all of them in the browser.
 *
 * Read-only; behind the second factor, like every read of a project's existence. Owner only: the query is on
 * `userId`, so a project shared with this account is never answered here (those are read through the rules).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The most projects one answer carries — far above the write ceiling's pace; the answer says when it was reached. */
const MAX_ROWS = 2000;

/** Projects read in parallel while their artefacts are filled in. */
const PARALLEL = 8;

export async function GET(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaRefusal(mfaErr);
      return NextResponse.json({ error: q?.message || 'Multi-factor authentication required.' }, { status: q?.status || 403 });
    }
    try {
      // Each answer reads every project of the account: 120 an hour, the most the list asks for when it is read again
      // on coming back into view at most every 30 s (`REVISIT_MS`), plus the reads after the list's own actions.
      await assertRateLimit(`workspace-rows:${decodedToken.uid}`, 120, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }
    try {
      await assertAccountActive(decodedToken.uid);
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    const { db } = await getAdminDb();
    const snap = await db.collection('projects').where('userId', '==', decodedToken.uid).limit(MAX_ROWS + 1).get();
    const docs = snap.docs.slice(0, MAX_ROWS);
    const rows: HomeRow[] = [];
    for (let i = 0; i < docs.length; i += PARALLEL) {
      const batch = docs.slice(i, i + PARALLEL);
      const read = await Promise.all(
        batch.map(async (d: FirebaseFirestore.QueryDocumentSnapshot) => {
          const data = (d.data() || {}) as Record<string, unknown>;
          let full = data;
          try {
            full = await withStoredArtefacts(db, d.ref, data);
          } catch (artefactErr: unknown) {
            // The row is still listed — a project must never vanish from the list because a part
            // could not be read; its later phases then read as the document alone shows them.
            logger.warn('workspace-rows: the stored artefacts of a project could not be read', {
              route: 'api/workspace-rows',
              projectId: d.id,
              error: errMessage(artefactErr),
            });
          }
          const row = toHomeRow({ ...(full as unknown as Project), id: d.id }, 'own');
          // Only the row's own keys leave the server.
          return Object.fromEntries(HOME_ROW_KEYS.map((k) => [k, row[k]])) as unknown as HomeRow;
        }),
      );
      rows.push(...read);
    }
    return NextResponse.json(
      { rows, truncated: snap.docs.length > MAX_ROWS },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err: unknown) {
    logger.error('workspace rows could not be listed', { route: 'api/workspace-rows', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not list your projects.' }, { status: 500 });
  }
}
