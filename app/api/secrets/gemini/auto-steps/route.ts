import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  assertMfaSatisfied,
  assertAccountActive,
  setOwnKeyAutoSteps,
  QuotaError,
} from '@/lib/firebase-admin';
import { byokRequiresEnrolment } from '@/lib/mfa-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger, providerErrorShape } from '@/lib/logger';
import { readBoundedRequestJson, SMALL_REQUEST_BODY_LIMITS } from '@/lib/url-validation';

/**
 * POST /api/secrets/gemini/auto-steps
 *
 * Body: `{ on: boolean }`. Switches the automatic steps — the plain wording and
 * the business names the product starts by itself when the owner opens a
 * project (3.0.20) — on or off **for the account's stored own key** (roadmap
 * 3.0.21, owner decision 22.10.2026 on question B6 of the legal review). Off by
 * default: a newly stored key starts off. With the platform key the automatic
 * steps run as before and this switch does not exist.
 *
 * Written through the Admin SDK on the key's record and mirrored on the
 * profile (`lib/firebase-admin.ts`, `setOwnKeyAutoSteps`). Gated like the
 * other own-key routes: a verified token, an enrolled second factor, an active
 * account on the current Terms.
 */
export async function POST(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  try {
    await assertMfaSatisfied(req, decodedToken, { requireEnrolment: byokRequiresEnrolment });
    await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });
    await assertRateLimit(`byok_auto_steps:${decodedToken.uid}`, 30, 60 * 60 * 1000);

    const read = await readBoundedRequestJson(req, SMALL_REQUEST_BODY_LIMITS);
    if (read.tooLarge) return NextResponse.json({ error: 'The request is too large.', code: 'too-large' }, { status: 413 });
    const body = read.body as { on?: unknown } | null;
    if (typeof body?.on !== 'boolean') {
      return NextResponse.json({ error: 'The switch must be true or false.' }, { status: 400 });
    }
    // Writes the switch and its audit row in one transaction.
    const result = await setOwnKeyAutoSteps(decodedToken.uid, body.on);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    logger.error('byok auto-steps switch failed', { route: 'api/secrets/gemini/auto-steps', error: providerErrorShape(err) });
    return NextResponse.json({ error: 'The switch could not be saved.' }, { status: 500 });
  }
}
