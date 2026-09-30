import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  saveGeminiApiKey,
  deleteGeminiApiKey,
  assertMfaSatisfied,
  assertAccountActive,
  assertByokAllowed,
  getAdminDb,
  logAuditEvent,
  QuotaError,
} from '@/lib/firebase-admin';
import { byokRequiresEnrolment } from '@/lib/mfa-gate';
import { logger, providerErrorShape } from '@/lib/logger';
import { ByokKeyUnavailableError } from '@/lib/byok-key';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/secrets/gemini
 *
 * Saves a user's custom Gemini API key securely.
 * Body: { apiKey: string }
 */
export async function POST(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. MFA Step-up Gate
    await assertMfaSatisfied(req, decodedToken, { requireEnrolment: byokRequiresEnrolment });

    // F-02: block suspended/stale-Terms accounts from managing a BYOK key. Approval is
    // NOT required to *store* a key — the bypass the finding is about is *using* it, which
    // is gated at /api/gemini (requireApproved). QuotaError is handled by the catch below.
    await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });

    // 3.0.13 (c): the tier rule the settings card applies, held here as well —
    // the same function, so the page and the route cannot disagree.
    await assertByokAllowed(decodedToken.uid, decodedToken.admin === true);

    // 2. Rate Limiting Gate (10 requests per hour)
    const ip = getClientIp(req);
    await assertRateLimit(`byok_save:${decodedToken.uid}:${ip}`, 10, 3600000);

    const body = await req.json().catch(() => ({}));
    const { apiKey } = body as { apiKey?: string };

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'Missing required field: apiKey.' }, { status: 400 });
    }

    let metadata: Awaited<ReturnType<typeof saveGeminiApiKey>>;
    try {
      metadata = await saveGeminiApiKey(decodedToken.uid, apiKey.trim());
    } catch (sealErr: unknown) {
      // 3.0.13 (g): no usable BYOK_ENCRYPTION_KEY on this deployment. Refused
      // with a reason, and nothing written — never sealed with the S/4 key
      // instead. `/api/health` reports the same condition as degraded.
      if (sealErr instanceof ByokKeyUnavailableError) {
        logger.critical('byok key save refused: BYOK_ENCRYPTION_KEY is not set or not 32 bytes', {
          route: 'api/secrets/gemini',
          code: sealErr.code,
        });
        return NextResponse.json({ error: sealErr.message, code: sealErr.code }, { status: 503 });
      }
      throw sealErr;
    }

    // 3. Security Audit Logging
    const { db } = await getAdminDb();
    await logAuditEvent(db, decodedToken.uid, 'BYOK_SAVE', decodedToken.uid);

    return NextResponse.json({ ok: true, ...metadata });
  } catch (err: any) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.message?.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    // A code, never the error: a failure here can carry the key being stored or
    // a provider's answer body, and the log is read by more people than the
    // vault (3.0.13 e).
    logger.error('byok key save failed', { route: 'api/secrets/gemini', error: providerErrorShape(err) });
    
    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_SAVE_FAIL', decodedToken.uid);
    } catch {}

    return NextResponse.json({ error: 'Failed to save API key due to an internal error.' }, { status: 500 });
  }
}

/**
 * DELETE /api/secrets/gemini
 *
 * Deletes a user's custom Gemini API key securely.
 */
export async function DELETE(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. MFA Step-up Gate
    await assertMfaSatisfied(req, decodedToken, { requireEnrolment: byokRequiresEnrolment });

    // 2. Rate Limiting Gate (10 requests per hour)
    const ip = getClientIp(req);
    await assertRateLimit(`byok_delete:${decodedToken.uid}:${ip}`, 10, 3600000);

    // No account-state gate, on purpose — the same intent
    // `app/api/projects/[projectId]/readers/route.ts` states about revoking.
    // Taking your own key off this server is how you stop it being used, and a
    // suspended account is the case where that matters most: it must not be the
    // one state in which the key cannot be withdrawn. Every route that *spends*
    // the key does check (POST above, /test, /status), which is where the gate
    // belongs (security audit of b88c77b, where this omission was read as the
    // same defect and is not).
    await deleteGeminiApiKey(decodedToken.uid);

    // 3. Security Audit Logging
    const { db } = await getAdminDb();
    await logAuditEvent(db, decodedToken.uid, 'BYOK_DELETE', decodedToken.uid);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.message?.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    logger.error('byok key delete failed', { route: 'api/secrets/gemini', error: providerErrorShape(err) });

    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_DELETE_FAIL', decodedToken.uid);
    } catch {}

    return NextResponse.json({ error: 'Failed to delete API key due to an internal error.' }, { status: 500 });
  }
}
