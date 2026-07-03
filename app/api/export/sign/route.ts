import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/export/sign  — DEPRECATED / DISABLED (v2.0)
 *
 * This legacy endpoint used to compute an HMAC signature over a
 * *client-supplied* list of file hashes. That let an authenticated project
 * owner obtain a valid signature for arbitrary, non-server-generated content,
 * which undermined the core v2 trust-chain guarantee that audit evidence is
 * server-authoritative.
 *
 * Audit packs are now generated, hashed, and signed entirely server-side by
 * `POST /api/audit-pack/create` (see lib/audit-pack.ts). This route no longer
 * signs anything and returns 410 Gone. Verification of existing packs is
 * unaffected — see `POST /api/export/verify`.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        'This endpoint has been removed. Audit packs are generated and signed server-side. Use POST /api/audit-pack/create.',
      code: 'endpoint_removed',
      replacement: '/api/audit-pack/create',
    },
    { status: 410 },
  );
}
