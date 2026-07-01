import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/export/verify
 *
 * Public endpoint (no authentication required) that verifies
 * the HMAC-SHA256 signature of an audit pack manifest.
 *
 * This allows external auditors (e.g., KPMG, SAP) to verify
 * audit pack integrity without needing a platform account.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limiting by IP: 30 requests/min
    const clientIp = getClientIp(req);
    await assertRateLimit(`export-verify:${clientIp}`, 30, 60_000);

    const body = await req.json().catch(() => ({}));
    const { canonicalManifest, signature } = body;

    if (!canonicalManifest || typeof canonicalManifest !== 'string') {
      return NextResponse.json(
        { error: 'Missing required parameter: canonicalManifest.' },
        { status: 400 },
      );
    }

    if (canonicalManifest.length > 32768) {
      return NextResponse.json(
        { error: 'Canonical manifest exceeds maximum allowed size of 32KB.' },
        { status: 400 },
      );
    }

    if (!signature || typeof signature !== 'string') {
      return NextResponse.json(
        { error: 'Missing required parameter: signature.' },
        { status: 400 },
      );
    }

    if (signature.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(signature)) {
      return NextResponse.json(
        { error: 'Invalid signature format. Must be a 64-character hex string.' },
        { status: 400 },
      );
    }

    // Compute the manifest hash and expected HMAC signature
    const isProduction =
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true';
    const signingKey = process.env.AUDIT_SIGNING_KEY;

    if (!signingKey && isProduction) {
      console.error('CRITICAL: AUDIT_SIGNING_KEY is missing in production.');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const finalKey = signingKey || 'dev_audit_signing_key_fallback_clean_core';

    const manifestHash = crypto.createHash('sha256').update(canonicalManifest).digest('hex');
    const expectedSignature = crypto
      .createHmac('sha256', finalKey)
      .update(manifestHash)
      .digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex'),
    );

    return NextResponse.json({ valid, manifestHash });
  } catch (error: any) {
    if (error?.statusCode === 429) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    // Don't reveal internal details to unauthenticated callers
    console.error('Error in /api/export/verify:', error);
    return NextResponse.json({ valid: false, error: 'Verification failed.' }, { status: 200 });
  }
}
