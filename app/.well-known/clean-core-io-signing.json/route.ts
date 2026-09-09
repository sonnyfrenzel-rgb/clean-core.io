import { NextResponse } from 'next/server';
import { getPublishedPublicKey } from '@/lib/audit-signing-keypair';

/**
 * The public half of the audit-pack signing key.
 *
 * This endpoint is what makes "anyone can verify" a true sentence. Until it
 * existed, every signature on the site was HMAC-SHA256 against a shared secret,
 * so verifying a pack required the same key that could forge one — and the only
 * party holding it was the server that issued the pack.
 *
 * Published unauthenticated and cached, because a key nobody can fetch verifies
 * nothing. There is no secret here: the private half never leaves the runtime.
 *
 * `.well-known` follows RFC 8615. The filename carries `.json` so a browser and
 * a curl both get something sensible without content negotiation.
 */
export const runtime = 'nodejs';
export const revalidate = 3600;

export function GET() {
  const key = getPublishedPublicKey();

  if (!key) {
    // No asymmetric key configured. Say so plainly rather than serving an empty
    // key set that a verifier could mistake for "this pack's key was revoked".
    return NextResponse.json(
      {
        keys: [],
        note:
          'No asymmetric signing key is configured on this instance. Audit packs ' +
          'from here carry the HMAC signature only and can be checked with ' +
          'POST /api/export/verify.',
      },
      { status: 503, headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }

  return NextResponse.json(
    {
      keys: [
        {
          keyId: key.keyId,
          algorithm: key.algorithm,
          use: 'audit-pack-signature',
          publicKey: key.publicKey,
          publicKeyPem: key.publicKeyPem,
        },
      ],
      verify:
        'Signatures cover the manifestHash string in manifest.json. ' +
        'Offline verifier: scripts/verify-pack.mjs in the repository.',
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
