import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { getSigningKeypair, verifyEd25519 } from '@/lib/audit-signing-keypair';

/**
 * POST /api/export/verify
 *
 * Public endpoint (no authentication required) that verifies an audit pack
 * manifest signature — Ed25519 when the pack carries one, HMAC-SHA256 otherwise.
 *
 * The two are not equivalent and the response says which ran. An HMAC check can
 * only happen here, because it needs the shared secret; that made "anyone can
 * verify" false for every reader of this site, since the only party able to
 * check a pack was the one that issued it. An Ed25519 check needs nothing but
 * the public key at /.well-known/clean-core-io-signing.json, so this endpoint is
 * a convenience for it rather than the only way — and `verifiableOffline: true`
 * in the response is there to say so.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limiting by IP: 30 requests/min
    const clientIp = getClientIp(req);
    await assertRateLimit(`export-verify:${clientIp}`, 30, 60_000);

    const body = await req.json().catch(() => ({}));
    const { canonicalManifest, signature, signatureEd25519 } = body;

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

    /*
     * The asymmetric path, taken first when the caller offers one.
     *
     * It needs no secret: the public key is published at
     * /.well-known/clean-core-io-signing.json, and a caller who fetches it can
     * run this check themselves without asking us anything. That is the point of
     * having it — this endpoint is a convenience for the asymmetric signature and
     * the only option for the HMAC one, and the response says which was used so
     * nobody mistakes the weaker guarantee for the stronger.
     */
    if (typeof signatureEd25519 === 'string' && signatureEd25519.length > 0) {
      const pair = getSigningKeypair();
      if (!pair) {
        return NextResponse.json(
          {
            error:
              'This instance has no asymmetric signing key, so it cannot check an ' +
              'Ed25519 signature. Fetch the issuing instance\'s published key and ' +
              'verify offline, or send the HMAC signature instead.',
          },
          { status: 503 },
        );
      }
      const manifestHash = crypto.createHash('sha256').update(canonicalManifest).digest('hex');
      const valid = verifyEd25519(manifestHash, signatureEd25519, pair.publicKey);
      return NextResponse.json({
        valid,
        manifestHash,
        algorithm: 'Ed25519',
        keyId: pair.keyId,
        // Said out loud because it is the whole difference: this one did not need
        // a shared secret and the caller could have run it themselves.
        verifiableOffline: true,
      });
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
    // Unconditional. This endpoint is the product's trust claim: it is the thing
    // that tells a reader "this pack is genuine". Verifying against a fallback
    // constant meant it would say that about a pack anyone could have forged.
    const signingKey = getAuditSigningKey();
    if (!signingKey) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const manifestHash = crypto.createHash('sha256').update(canonicalManifest).digest('hex');
    const expectedSignature = crypto
      .createHmac('sha256', signingKey)
      .update(manifestHash)
      .digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex'),
    );

    return NextResponse.json({ valid, manifestHash });
  } catch (error: any) {
    // QuotaError exposes `.status`, not `.statusCode`. Testing the wrong property
    // made this branch unreachable, so a rate-limited caller fell through to the
    // catch below and was told HTTP 200 { valid: false } — a genuine audit pack
    // reported as forged. For a product whose whole claim is verifiable evidence
    // that is the most damaging answer this endpoint can give.
    if (error?.status === 429 || error?.statusCode === 429) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    // Don't reveal internal details to unauthenticated callers. `valid` is
    // deliberately absent: we did not determine that the signature is bad, we
    // failed to check it, and those are different statements.
    console.error('Error in /api/export/verify:', error);
    return NextResponse.json(
      { error: 'Verification could not be completed. This is not a statement about the signature.' },
      { status: 500 },
    );
  }
}
