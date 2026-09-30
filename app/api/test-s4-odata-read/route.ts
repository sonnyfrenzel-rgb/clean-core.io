import { NextRequest, NextResponse } from 'next/server';
import {
  isUrlSafe,
  safeFetch,
  SsrfError,
  isSafeODataServicePath,
  readBoundedBody,
  readBoundedJson,
  TOKEN_BODY_LIMITS,
  ODATA_BODY_LIMITS,
} from '@/lib/url-validation';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { loadS4ConfigForUser, resolveS4Connection } from '@/lib/s4-credentials';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { upstreamBodyShape } from '@/lib/upstream-body-shape';

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

/**
 * OAuth 2.0 client-credentials token exchange.
 *
 * The two call sites below used to inline the whole exchange, and neither of
 * them passed an `AbortSignal` or looked at the status: `safeFetch` was awaited
 * with no deadline at all and `tokenResp.json()` then buffered whatever came
 * back, so a token endpoint that answered its headers and kept streaming held
 * a Cloud Run worker and its memory for as long as it liked. One helper with a
 * deadline on the connection and `TOKEN_BODY_LIMITS` on the body, in the shape
 * the three sibling routes use.
 */
async function fetchOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await safeFetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Accept': 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });

    // The abort timer covered the wait for the headers and is done here; the
    // body has its own limits below.
    clearTimeout(timeout);

    // A refusal was parsed as if it were a token before this: the body of a
    // 401 is an error document, and reading `access_token` off it simply found
    // nothing while the request carried on as though authentication had been
    // skipped.
    if (!response.ok) {
      const errorBody = await readBoundedBody(response, TOKEN_BODY_LIMITS).catch(() => '');
      // Neither the caller nor the log gets the body: the caller the status,
      // the log the status and a shape word (SEC-2026-525; QA review of 46a7d64baad3).
      logger.warn('oauth token exchange rejected', {
        route: 'api/test-s4-odata-read',
        status: response.status,
        bodyShape: upstreamBodyShape(errorBody),
      });
      throw new Error(
        `Token endpoint returned HTTP ${response.status}. Verify Client ID and Client Secret.`,
      );
    }

    return await readBoundedJson(response, TOKEN_BODY_LIMITS);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      throw new Error('OAuth token request timed out after 12 seconds.');
    }
    throw err;
  }
}

/** A token response that carries no token is a failed exchange, not an anonymous read. */
function requireAccessToken(tokenData: { access_token?: unknown }): string {
  if (typeof tokenData?.access_token !== 'string' || !tokenData.access_token) {
    throw new Error('Token endpoint responded but did not return an access_token.');
  }
  return tokenData.access_token;
}

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

    // A declared scheme is either carried out or refused. Each branch used to
    // add its header only when every credential was present (and OAuth only
    // when a token came back), then read on without one — a public entity set
    // was then reported as a successful read under a scheme that was never
    // used (QA full review of fc787674705f, d64ccabb0bbb).
    const auth = (parsed.Authentication || parsed.authentication || '').toLowerCase();
    if (auth === 'basicauthentication' || auth === 'basic') {
      const user = parsed.User || parsed.user || parsed.Username || parsed.username;
      const pass = parsed.Password || parsed.password;
      if (!user || !pass) throw new Error('Destination uses BasicAuthentication but is missing "User" or "Password".');
      headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    } else if (auth === 'oauth2clientcredentials' || auth === 'oauth2_client_credentials') {
      const tokenUrl = parsed.tokenServiceURL || parsed.TokenServiceURL || parsed.tokenUrl;
      const clientId = parsed.clientId || parsed.ClientId;
      const clientSecret = parsed.clientSecret || parsed.ClientSecret;
      if (!tokenUrl || !clientId || !clientSecret) {
        throw new Error('Destination uses OAuth2ClientCredentials but is missing "tokenServiceURL", "clientId" or "clientSecret".');
      }
      const tokenCheck = await isUrlSafe(tokenUrl);
      if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
      headers['Authorization'] = `Bearer ${requireAccessToken(await fetchOAuth2Token(tokenUrl, clientId, clientSecret))}`;
    }
  } else if (body.authType === 'oauth2') {
    if (!body.tokenUrl || !body.username || !body.password) {
      throw new Error('Token URL, Client ID and Client Secret are required for OAuth 2.0.');
    }
    const tokenCheck = await isUrlSafe(body.tokenUrl);
    if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
    headers['Authorization'] = `Bearer ${requireAccessToken(await fetchOAuth2Token(body.tokenUrl, body.username, body.password))}`;
  } else if (body.authType === 'basic') {
    if (!body.username || !body.password) throw new Error('Username and password are required for Basic Authentication.');
    headers['Authorization'] = `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}`;
  } else if (body.authType === 'sap_hub') {
    if (!body.password) throw new Error('An API key is required for the SAP API Hub.');
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

    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: any) {
      return NextResponse.json({ status: 'failed', message: mfaErr.message || 'MFA verification required.' }, { status: 403 });
    }

    try {
      await assertS4TenantAccess(decodedToken.uid, { isAdminClaim: (decodedToken as any).admin === true });
    } catch (e: any) {
      return NextResponse.json({ status: 'failed', message: e.message || 'Access denied.' }, { status: 403 });
    }

    // Per account, before any OAuth exchange or tenant read (QA full review of
    // fc787674705f, 097d4859c855). A live check reads up to five entity sets,
    // so the budget is twice the metadata routes'.
    try {
      await assertRateLimit(`test-s4-odata-read:${decodedToken.uid}`, 60, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      if (rateErr instanceof QuotaError) {
        return NextResponse.json({ status: 'failed', message: rateErr.message }, { status: rateErr.status });
      }
      throw rateErr;
    }

    const body = await req.json();
    const { entitySet } = body;

    // F-03: Resolve credentials — stored (server-side) or transient (from body)
    const stored = body.useStoredCredentials ? await loadS4ConfigForUser(decodedToken.uid) : null;
    // The vault is all-or-nothing: asking for stored credentials must not let
    // the request redirect them to a URL of its choosing. See resolveS4Connection.
    const { config: s4 } = resolveS4Connection(body, stored);
    const resolvedBody = {
      ...body,
      url: s4.url,
      username: s4.username,
      password: s4.password,
      authType: s4.authType,
      tokenUrl: s4.tokenUrl,
      btpDestinationJson: s4.btpDestinationJson,
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
    const servicePath = resolvedBody.servicePath || '/sap/opu/odata/sap/API_BUSINESS_PARTNER';
    // Audit P2: constrain path building — no arbitrary GET paths on the allowed host.
    if (!isSafeODataServicePath(servicePath)) {
      return NextResponse.json({ status: 'failed', message: 'Invalid OData service path.', entitySet }, { status: 400 });
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entitySet || '')) {
      return NextResponse.json({ status: 'failed', message: 'Invalid entity set name.', entitySet }, { status: 400 });
    }
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
      // Only the status is reported; the body is cancelled rather than left
      // streaming after the timer was cleared (QA full review of fc787674705f,
      // 3c5bdb95ddbd).
      await response.body?.cancel().catch(() => {});
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

    // Parse the JSON response, under a size limit and a deadline of its own:
    // the abort timer above ended with the headers, and `response.json()` then
    // buffered an entity read of any length from the tenant.
    const data = await readBoundedJson(response, ODATA_BODY_LIMITS).catch(() => null);
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
