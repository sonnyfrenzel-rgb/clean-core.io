import { NextResponse } from 'next/server';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { saveS4Credentials, deleteS4Credentials, loadS4ConfigForUser } from '@/lib/s4-credentials';
import { isUrlSafe } from '@/lib/url-validation';
import { logger, errMessage } from '@/lib/logger';

/**
 * POST /api/s4-credentials — Save S/4HANA credentials (encrypted server-side).
 * GET  /api/s4-credentials — Get status (masked, no secrets).
 * DELETE /api/s4-credentials — Delete stored credentials (GDPR erasure).
 */

// Save (encrypted). Body: { url, username, password, authType, tokenUrl, btpDestinationJson }
export async function POST(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    await assertMfaSatisfied(req, decoded);
    await assertS4TenantAccess(decoded.uid, { isAdminClaim: (decoded as any).admin === true });
  } catch (e: any) {
    if (e instanceof QuotaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error('s4-credentials authorization check failed', { route: 'api/s4-credentials', error: errMessage(e) });
    return NextResponse.json({ error: 'Internal server error during authorization check.' }, { status: 500 });
  }

  const body = await req.json();
  if (!body?.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'URL is required.' }, { status: 400 });
  }

  // The OAuth token endpoint is checked here with the same validator every
  // route applies before the token exchange (`isUrlSafe`, SECURITY.md SSRF
  // table row 11). That check still runs at use time — it is the one that
  // holds, since DNS can change after saving — but a token URL pointing at a
  // private address, a metadata host or plain HTTP used to be stored without a
  // word and refused only later, on every use (owner decision 02.10.2026).
  if (body.tokenUrl !== undefined && body.tokenUrl !== null && body.tokenUrl !== '') {
    if (typeof body.tokenUrl !== 'string') {
      return NextResponse.json({ error: 'Token URL must be a string.' }, { status: 400 });
    }
    const tokenCheck = await isUrlSafe(body.tokenUrl);
    if (!tokenCheck.safe) {
      return NextResponse.json(
        { error: `Token URL not allowed: ${tokenCheck.reason || 'URL not allowed.'}` },
        { status: 403 },
      );
    }
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
    // A fixed sentence outward; the cause (a key or storage failure) into the log.
    logger.error('s4-credentials store failed', { route: 'api/s4-credentials', error: errMessage(e) });
    return NextResponse.json({ error: 'Failed to store credentials.' }, { status: 500 });
  }
}

// Status (without secrets, masked).
export async function GET(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    await assertMfaSatisfied(req, decoded);
    await assertS4TenantAccess(decoded.uid, { isAdminClaim: (decoded as any).admin === true });
  } catch (e: any) {
    if (e instanceof QuotaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    logger.error('s4-credentials authorization check failed', { route: 'api/s4-credentials', error: errMessage(e) });
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

// Delete.
export async function DELETE(req: Request) {
  const decoded = await verifyRequestAuth(req);
  if (!decoded) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    await assertMfaSatisfied(req, decoded);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'MFA verification required.' }, { status: 403 });
  }

  // `ok` only once both the vault document and the profile metadata are gone;
  // a refused delete is reported, not answered with success.
  try {
    await deleteS4Credentials(decoded.uid);
  } catch (e) {
    // The error text stays in the log; the caller gets a fixed sentence
    // (carried QA finding 96af10679a29).
    logger.error('s4-credentials delete failed', { route: 'api/s4-credentials', error: errMessage(e) });
    return NextResponse.json({ error: 'Failed to delete credentials.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
