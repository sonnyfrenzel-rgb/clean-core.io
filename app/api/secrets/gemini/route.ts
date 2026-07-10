import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  saveGeminiApiKey,
  deleteGeminiApiKey,
  assertMfaSatisfied,
  assertAccountActive,
  getAdminDb,
  logAuditEvent,
  QuotaError,
} from '@/lib/firebase-admin';
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
    await assertMfaSatisfied(req, decodedToken);

    // F-02: block suspended/stale-Terms accounts from managing a BYOK key. Approval is
    // NOT required to *store* a key — the bypass the finding is about is *using* it, which
    // is gated at /api/gemini (requireApproved). QuotaError is handled by the catch below.
    await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });

    // 2. Rate Limiting Gate (10 requests per hour)
    const ip = getClientIp(req);
    await assertRateLimit(`byok_save:${decodedToken.uid}:${ip}`, 10, 3600000);

    const body = await req.json().catch(() => ({}));
    const { apiKey } = body as { apiKey?: string };

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'Missing required field: apiKey.' }, { status: 400 });
    }

    const metadata = await saveGeminiApiKey(decodedToken.uid, apiKey.trim());

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
    console.error('Error saving Gemini API key:', err);
    
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
    await assertMfaSatisfied(req, decodedToken);

    // 2. Rate Limiting Gate (10 requests per hour)
    const ip = getClientIp(req);
    await assertRateLimit(`byok_delete:${decodedToken.uid}:${ip}`, 10, 3600000);

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
    console.error('Error deleting Gemini API key:', err);

    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_DELETE_FAIL', decodedToken.uid);
    } catch {}

    return NextResponse.json({ error: 'Failed to delete API key due to an internal error.' }, { status: 500 });
  }
}
