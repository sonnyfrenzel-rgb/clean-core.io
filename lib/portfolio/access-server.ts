import { NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { byokAllowed } from '@/lib/byok-eligibility';
import { ownKeyProviderOf } from '@/lib/model-providers';
import { millisOfStored, portfolioAccessOf, PORTFOLIO_CLOSED_CODE, type PortfolioAccess } from './access';

/**
 * The server half of `lib/portfolio/access.ts`, and the gate every portfolio
 * route an owner calls goes through — roadmap 3.0.21.
 *
 * In order: a verified token, the second factor where the account has one, a
 * rate budget of the route's own, an active and approved account on the
 * current Terms (the gate `/api/runs/create` applies, because a batch ends in
 * signed runs), and the own key, stored and tested. Each refusal is answered
 * here with its sentence, so a route reads `if (!gate.ok) return gate.response`
 * and nothing else.
 *
 * Not used by the read of a shared portfolio: an invited reader needs no own
 * key, since reading an aggregate spends nothing and calls no model
 * (`lib/portfolio/selection-server.ts`).
 */

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

/** The three facts, read from the profile and the stored key record. */
export async function readPortfolioAccess(db: AdminDb, uid: string, isAdminClaim: boolean): Promise<PortfolioAccess> {
  const profile = ((await db.collection('users').doc(uid).get()).data() ?? null) as Record<string, unknown> | null;
  const allowed = byokAllowed({ isAdmin: isAdminClaim === true, tier: profile?.tier });
  const named = ownKeyProviderOf(profile);
  if (!allowed || named === null || named === 'unknown') {
    return portfolioAccessOf({ byokAllowed: allowed, keyStored: false, testedAtMs: null, rotatedAtMs: null });
  }
  const record = await db.collection('user_secrets').doc(uid).collection('providers').doc(named).get();
  const data = (record.exists ? record.data() : null) as Record<string, unknown> | null;
  return portfolioAccessOf({
    byokAllowed: allowed,
    keyStored: Boolean(data && typeof data.encryptedApiKey === 'string' && data.encryptedApiKey),
    testedAtMs: millisOfStored(data?.testedAt),
    rotatedAtMs: millisOfStored(data?.rotatedAt),
  });
}

export type PortfolioGate =
  | { ok: true; uid: string; email: string; isAdmin: boolean; db: AdminDb; FieldValue: Awaited<ReturnType<typeof getAdminDb>>['FieldValue'] }
  | { ok: false; response: NextResponse };

export interface PortfolioGateOptions {
  /** The rate-limit bucket, per account. */
  bucket: string;
  /** Requests per hour in that bucket. */
  perHour: number;
  /**
   * `'use'` (default): approved, current Terms, own key stored and tested —
   * everything that makes, reads or shares a portfolio.
   * `'manage'`: an account that is not suspended, nothing more — for taking a
   * share back or removing a record. Withdrawing must never depend on the key
   * or the plan the account has today (the rule of `DELETE /api/secrets/gemini`).
   * `'report'`: as `'use'` without the key — for the route that reports the
   * access itself.
   */
  mode?: 'use' | 'manage' | 'report';
}

function refusal(message: string, status: number, code?: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json(code ? { error: message, code } : { error: message }, { status }) };
}

export async function openPortfolioRoute(req: Request, opts: PortfolioGateOptions): Promise<PortfolioGate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) return refusal('Authentication required.', 401);
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return refusal(q?.message || 'Multi-factor authentication required.', q?.status || 403);
  }
  try {
    await assertRateLimit(`${opts.bucket}:${decodedToken.uid}`, opts.perHour, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return refusal(q?.message || 'Too many requests.', q?.status || 429);
  }
  const isAdmin = decodedToken.admin === true;
  const mode = opts.mode ?? 'use';
  try {
    await assertAccountActive(
      decodedToken.uid,
      mode === 'manage' ? {} : { requireApproved: true, requireCurrentTerms: true, isAdminClaim: isAdmin },
    );
  } catch (gateErr: unknown) {
    if (gateErr instanceof QuotaError) return refusal(gateErr.message, gateErr.status);
    throw gateErr;
  }
  const { db, FieldValue } = await getAdminDb();
  if (mode === 'use') {
    const access = await readPortfolioAccess(db, decodedToken.uid, isAdmin);
    if (!access.open) return refusal(access.message, 403, PORTFOLIO_CLOSED_CODE);
  }
  return {
    ok: true,
    uid: decodedToken.uid,
    email: typeof decodedToken.email === 'string' ? decodedToken.email : '',
    isAdmin,
    db,
    FieldValue,
  };
}
