import { NextRequest, NextResponse } from 'next/server';
import { isUrlSafe, safeFetch, SsrfError } from '@/lib/url-validation';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';

/**
 * POST /api/test-s4-odata-read
 *
 * Executes a read-only OData GET request against a live S/4HANA tenant
 * to verify that an EntitySet is accessible and returns data.
 *
 * Request body:
 *   {
 *     url: string,
 *     username?: string,
 *     password?: string,
 *     authType: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination',
 *     tokenUrl?: string,
 *     btpDestinationJson?: string,
 *     servicePath?: string,       // e.g. /sap/opu/odata/sap/API_BUSINESS_PARTNER
 *     entitySet: string           // e.g. A_BusinessPartner
 *   }
 *
 * Response:
 *   {
 *     status: 'success' | 'failed',
 *     message: string,
 *     entitySet: string,
 *     recordCount?: number,
 *     httpStatus?: number,
 *     sampleFields?: string[]
 *   }
 */

// --- Helper: Build auth headers (shared logic with fetch-s4-metadata) ---
async function buildAuthHeaders(body: any): Promise<{ headers: Record<string, string>; targetUrl: string }> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'CleanCore-Pilot/1.0 (OData-Read-Test)',
  };

  let targetUrl = body.url;

  if (body.authType === 'btp_destination' && body.btpDestinationJson) {
    let parsed: any;
    try { parsed = JSON.parse(body.btpDestinationJson); } catch { throw new Error('Invalid BTP Destination JSON.'); }
    targetUrl = parsed.URL || parsed.url || parsed.Url;
    if (!targetUrl) throw new Error('Destination JSON missing URL field.');

    const auth = (parsed.Authentication || parsed.authentication || '').toLowerCase();
    if (auth === 'basicauthentication' || auth === 'basic') {
      const user = parsed.User || parsed.user || parsed.Username || parsed.username;
      const pass = parsed.Password || parsed.password;
      if (user && pass) headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    } else if (auth === 'oauth2clientcredentials' || auth === 'oauth2_client_credentials') {
      const tokenUrl = parsed.tokenServiceURL || parsed.TokenServiceURL || parsed.tokenUrl;
      const clientId = parsed.clientId || parsed.ClientId;
      const clientSecret = parsed.clientSecret || parsed.ClientSecret;
      if (tokenUrl && clientId && clientSecret) {
        const tokenCheck = await isUrlSafe(tokenUrl);
        if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
        const tokenResp = await safeFetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
          body: 'grant_type=client_credentials',
        });
        const tokenData = await tokenResp.json();
        if (tokenData.access_token) headers['Authorization'] = `Bearer ${tokenData.access_token}`;
      }
    }
  } else if (body.authType === 'oauth2' && body.tokenUrl && body.username && body.password) {
    const tokenCheck = await isUrlSafe(body.tokenUrl);
    if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
    const tokenResp = await safeFetch(body.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}` },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenResp.json();
    if (tokenData.access_token) headers['Authorization'] = `Bearer ${tokenData.access_token}`;
  } else if (body.authType === 'basic' && body.username && body.password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}`;
  } else if (body.authType === 'sap_hub' && body.password) {
    headers['APIKey'] = body.password;
  }

  return { headers, targetUrl };
}


export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ status: 'failed', message: 'Authentication required.' }, { status: 401 });
    }

    await assertS4TenantAccess(decodedToken.uid);

    const body = await req.json();
    const { entitySet } = body;

    // F-03: Resolve credentials — stored (server-side) or transient (from body)
    const stored = body.useStoredCredentials ? await loadS4ConfigForUser(decodedToken.uid) : null;
    const resolvedBody = {
      ...body,
      url: body.url ?? stored?.url,
      username: body.username ?? stored?.username,
      password: body.password ?? stored?.password,
      authType: body.authType ?? stored?.authType,
      tokenUrl: body.tokenUrl ?? stored?.tokenUrl,
      btpDestinationJson: body.btpDestinationJson ?? stored?.btpDestinationJson,
    };

    if (!entitySet) {
      return NextResponse.json({ status: 'failed', message: 'entitySet parameter is required.' }, { status: 400 });
    }

    // Build auth headers
    let targetUrl: string;
    let authHeaders: Record<string, string>;
    try {
      const result = await buildAuthHeaders(resolvedBody);
      targetUrl = result.targetUrl;
      authHeaders = result.headers;
    } catch (authErr: any) {
      return NextResponse.json({ status: 'failed', message: `Auth failed: ${authErr.message}`, entitySet }, { status: 401 });
    }

    // SSRF protection
    const urlCheck = await isUrlSafe(targetUrl);
    if (!urlCheck.safe) {
      return NextResponse.json({ status: 'failed', message: urlCheck.reason || 'URL not allowed.', entitySet }, { status: 403 });
    }

    // Build OData read URL: GET EntitySet?$top=1&$format=json
    const servicePath = body.servicePath || '/sap/opu/odata/sap/API_BUSINESS_PARTNER';
    const baseUrl = targetUrl.replace(/\/$/, '');
    const readUrl = `${baseUrl}${servicePath}/${entitySet}?$top=1&$format=json&$inlinecount=allpages`;

    // Execute GET with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await safeFetch(readUrl, {
        method: 'GET',
        headers: authHeaders,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      return NextResponse.json({
        status: 'failed',
        message: fetchErr.name === 'AbortError' ? 'Request timed out (15s).' : `Connection failed: ${fetchErr.message}`,
        entitySet,
      }, { status: fetchErr.name === 'AbortError' ? 504 : 502 });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json({
        status: 'failed',
        message: response.status === 401 ? 'Authentication rejected.'
          : response.status === 403 ? 'Access forbidden — missing authorization.'
          : response.status === 404 ? `EntitySet "${entitySet}" not found at this service path.`
          : `HTTP ${response.status}`,
        entitySet,
        httpStatus: response.status,
      });
    }

    // Parse JSON response
    const data = await response.json().catch(() => null);
    if (!data) {
      return NextResponse.json({
        status: 'failed',
        message: 'Response was not valid JSON.',
        entitySet,
        httpStatus: response.status,
      });
    }

    // OData v2 response structure: d.results[] or d.__count
    const results = data?.d?.results || [];
    const count = data?.d?.__count ? parseInt(data.d.__count, 10) : results.length;
    const sampleFields = results.length > 0
      ? Object.keys(results[0]).filter(k => !k.startsWith('__')).slice(0, 8)
      : [];

    return NextResponse.json({
      status: 'success',
      message: `${entitySet}: ${count} record(s) available, ${sampleFields.length} fields accessible`,
      entitySet,
      recordCount: count,
      httpStatus: response.status,
      sampleFields,
    });

  } catch (error: any) {
    if (error instanceof QuotaError) {
      return NextResponse.json({ status: 'failed', message: error.message }, { status: error.status });
    }
    console.error('[test-s4-odata-read] Error:', error);
    return NextResponse.json({ status: 'failed', message: 'Internal server error.' }, { status: 500 });
  }
}
