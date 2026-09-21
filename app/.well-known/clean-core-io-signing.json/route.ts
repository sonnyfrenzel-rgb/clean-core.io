import { NextResponse } from 'next/server';
import { getPublishedKeyring } from '@/lib/audit-signing-keypair';

/**
 * The public half of the audit-pack signing key — every one a verifier may need.
 *
 * This endpoint is what makes "anyone can verify" a true sentence. Until it
 * existed, every signature on the site was HMAC-SHA256 against a shared secret,
 * so verifying a pack required the same key that could forge one — and the only
 * party holding it was the server that issued the pack.
 *
 * It published exactly one key: the current one. That was the whole of it, and
 * it meant the first rotation would have made every pack already in an auditor's
 * hands unverifiable — not reported as forged, reported as "does not verify",
 * which is the worst sentence a genuine document can be given. A signature is
 * only as good as the ability to find the key that made it, so the key set is
 * append-only in practice: the active key, and the retired public keys the
 * operator still vouches for (`AUDIT_SIGNING_PUBLIC_KEYS_RETIRED`). Taking a key
 * *out* of that list is how a compromised key is revoked, and it is a decision,
 * not a side effect of rotating. `lib/audit-signing-keypair.ts` carries the
 * reasoning and what it costs.
 *
 * Published unauthenticated and cached, because a key nobody can fetch verifies
 * nothing. There is no secret here: the private half never leaves the runtime.
 *
 * `.well-known` follows RFC 8615. The filename carries `.json` so a browser and
 * a curl both get something sensible without content negotiation.
 */
export const runtime = 'nodejs';
/**
 * Cached, but not for an hour.
 *
 * Removal from the key set is how a compromised key is revoked (see below), and
 * the document was served `public, max-age=3600`: any browser, CDN or proxy that
 * fetched it the moment before the operator pulled the key kept confirming packs
 * signed with it for the rest of the hour, and nothing the operator can do
 * reaches that copy. Five minutes is still a cache — the document is a kilobyte
 * and an offline verifier fetches it once per check — and it is the length of
 * time a revocation can go unheard.
 */
export const revalidate = 300;
const MAX_AGE = 300;

export function GET() {
  const keys = getPublishedKeyring();

  if (keys.length === 0) {
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
      keys: keys.map((key) => ({
        keyId: key.keyId,
        algorithm: key.algorithm,
        use: 'audit-pack-signature',
        // `active` signs new packs; `retired` is kept so packs it signed before
        // the rotation still verify. A key that is neither is not listed at all,
        // and a pack naming it cannot be checked here — which is what revocation
        // looks like from the outside.
        status: key.status,
        publicKey: key.publicKey,
        publicKeyPem: key.publicKeyPem,
      })),
      verify:
        'Signatures cover the manifestHash string in manifest.json. Select the key ' +
        'whose keyId matches the pack\'s signingKeyId. Offline verifier: ' +
        'scripts/verify-pack.mjs in the repository.',
    },
    // `must-revalidate`: a stale copy may not be handed out while the origin is
    // unreachable either. "I could not reach the key set" is an honest answer;
    // an hour-old key set served as current is not.
    { headers: { 'Cache-Control': `public, max-age=${MAX_AGE}, must-revalidate` } },
  );
}
