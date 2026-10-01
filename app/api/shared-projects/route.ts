import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, assertMfaSatisfied, assertAccountActive, getAdminDb, QuotaError } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger, errMessage } from '@/lib/logger';
import { PROJECT_READERS_FIELD } from '@/lib/invitations';

/**
 * GET → the ids of the projects another account invited this one to read —
 * "Shared with me" in My workspace (roadmap 5.4, mockup s7).
 *
 * Why a route and not a client query. The read rule on `projects/{id}` is
 * "owner, or a uid on `readers`", and a list query has to be provable against
 * that rule for every document it could return. A query on `readers` alone
 * cannot prove the owner half — the rule reads `resource.data.userId`, which
 * the query does not constrain — so the emulator refuses it ("Property userId
 * is undefined … for 'list'"). Rewriting the rule would be a hand-deployed
 * rules change for a list view. So the server finds the ids, and the browser
 * then reads each project itself with an ordinary `get`, which the rule
 * answers per document: a revocation still ends the reading at the rules,
 * immediately, exactly as before.
 *
 * Ids only, nothing else: the name, the source and every figure come through
 * the rules, never through this route. Behind the second factor, like every
 * read of a project's existence.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The most shared projects one answer names. */
const MAX_SHARED = 50;

export async function GET(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      );
    }
    try {
      await assertRateLimit(`shared-projects:${decodedToken.uid}`, 240, 60 * 60 * 1000);
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
    const snap = await db
      .collection('projects')
      .where(PROJECT_READERS_FIELD, 'array-contains', decodedToken.uid)
      .limit(MAX_SHARED)
      .get();
    // A project the account owns and also reads is its own, not shared.
    const ids = snap.docs
      .filter((d: { data: () => Record<string, unknown> }) => (d.data() || {}).userId !== decodedToken.uid)
      .map((d: { id: string }) => d.id);
    return NextResponse.json({ ids });
  } catch (err: unknown) {
    logger.error('shared projects could not be listed', { route: 'api/shared-projects', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not list the projects shared with you.' }, { status: 500 });
  }
}
