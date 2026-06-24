import { NextResponse } from 'next/server';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError } from '@/lib/firebase-admin';
import { saveS4Credentials, deleteS4Credentials, loadS4ConfigForUser } from '@/lib/s4-credentials';
import { isUrlSafe } from '@/lib/url-validation';

/**
 * POST /api/s4-credentials — Save S/4HANA credentials (encrypted server-side).
 * GET  /api/s4-credentials — Get status (masked, no secrets).
 * DELETE /api/s4-credentials — Delete stored credentials (GDPR erasure).
 */

// Speichern (verschlüsselt). Body: { url, username, password, authType, tokenUrl, btpDestinationJson }
export async function POST(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    await assertS4TenantAccess(decoded.uid, { isAdminClaim: (decoded as any).admin === true });
  } catch (e: any) {
    if (e instanceof QuotaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Internal server error during authorization check.' }, { status: 500 });
  }

  const body = await req.json();
  if (!body?.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'URL is required.' }, { status: 400 });
  }
  const check = await isUrlSafe(body.url);
  if (!check.safe) return NextResponse.json({ error: check.reason || 'URL not allowed.' }, { status: 403 });

  try {
    const meta = await saveS4Credentials(decoded.uid, {
      url: body.url,
      username: body.username,
      password: body.password,
      authType: body.authType,
      tokenUrl: body.tokenUrl,
      btpDestinationJson: body.btpDestinationJson,
    });
    return NextResponse.json({ ok: true, meta });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to store credentials.' }, { status: 500 });
  }
}

// Status (ohne Secrets, maskiert).
export async function GET(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    await assertS4TenantAccess(decoded.uid, { isAdminClaim: (decoded as any).admin === true });
  } catch (e: any) {
    if (e instanceof QuotaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Internal server error during authorization check.' }, { status: 500 });
  }

  const cfg = await loadS4ConfigForUser(decoded.uid);
  if (!cfg) return NextResponse.json({ configured: false });
  return NextResponse.json({
    configured: true,
    url: cfg.url,
    username: cfg.username,
    authType: cfg.authType,
    tokenUrl: cfg.tokenUrl,
    passwordMasked: cfg.password ? '••••••••' : '',
  });
}

// Löschen.
export async function DELETE(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });



  await deleteS4Credentials(decoded.uid);
  return NextResponse.json({ ok: true });
}
