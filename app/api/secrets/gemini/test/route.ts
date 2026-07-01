import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  loadGeminiApiKey,
  assertMfaSatisfied,
  getAdminDb,
  logAuditEvent,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { GoogleGenAI } from '@google/genai';

/**
 * POST /api/secrets/gemini/test
 *
 * Tests connectivity of a Gemini API key.
 * If body contains { apiKey }, tests that specific key.
 * If body is empty, loads and decrypts the user's saved key, then tests it.
 */
export async function POST(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. MFA Step-up Gate
    await assertMfaSatisfied(req, decodedToken);

    // 2. Rate Limiting Gate (5 tests per 15 minutes)
    const ip = getClientIp(req);
    await assertRateLimit(`byok_test:${decodedToken.uid}:${ip}`, 5, 900000);

    const body = await req.json().catch(() => ({}));
    let { apiKey } = body as { apiKey?: string };

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      // Fallback: load saved key
      const savedKey = await loadGeminiApiKey(decodedToken.uid);
      if (!savedKey) {
        return NextResponse.json({ error: 'No custom API key has been saved yet.' }, { status: 400 });
      }
      apiKey = savedKey;
    }

    // Call Gemini to verify key
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Ping. Respond with exactly 'OK' to confirm connectivity.",
    });

    if (!result.text || !result.text.includes('OK')) {
      throw new Error('Invalid response from AI provider.');
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.message?.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('Gemini Key connectivity test failed:', err);

    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_TEST_FAIL', decodedToken.uid);
    } catch {}

    // Return a sanitized neutral error message to the client
    return NextResponse.json(
      { error: 'The API key did not pass authentication or a network error occurred.' },
      { status: 400 },
    );
  }
}
