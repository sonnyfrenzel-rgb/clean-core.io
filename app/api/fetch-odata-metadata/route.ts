import { NextRequest, NextResponse } from 'next/server';
import {
  isUrlSafe,
  safeFetch,
  SsrfError,
  readBoundedBody,
  readBoundedJson,
  readBoundedRequestJson,
  TOKEN_BODY_LIMITS,
  ODATA_BODY_LIMITS,
  S4_REQUEST_BODY_LIMITS,
} from '@/lib/url-validation';
import { mfaRefusal, verifyRequestAuth, assertS4TenantAccess, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger, errMessage } from '@/lib/logger';
import { upstreamBodyShape } from '@/lib/upstream-body-shape';
import { loadS4ConfigForUser, resolveS4Connection } from '@/lib/s4-credentials';

/**
 * POST /api/fetch-odata-metadata
 *
 * Fetches the `$metadata` document of one named OData service from an
 * S/4HANA tenant and parses EntityTypes and their Properties. `servicePath` is
 * required.
 *
 * Only the service's `$metadata` is ever requested — the schema, never a
 * record. The catalog mode that used to answer a call without `servicePath`
 * read the entries of the gateway catalog's `ServiceCollection` entity set,
 * which are records of the tenant; the privacy policy (section 2) says the
 * connection reads no record, so the mode is gone (3.0.21) and a call without
 * a service name is refused. `tests/s4-metadata-only-guard.spec.ts` holds it.
 *
 * Request body:
 *   {
 *     url: string,
 *     username?: string,
 *     password?: string,
 *     authType: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination',
 *     tokenUrl?: string,
 *     btpDestinationJson?: string,
 *     servicePath?: string   // e.g. "API_BUSINESS_PARTNER"
 *   }
 *
 * Response:
 *   {
 *     status: 'success',
 *     mode: 'metadata',
 *     servicePath: string,
 *     entityTypes: [{ name, properties: [{ name, type, nullable }] }],
 *     totalEntityTypes: number
 *   }
 */

// --- Helper: OAuth 2.0 Client Credentials Token Exchange ---
async function fetchOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await safeFetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });

    // The abort timer covered the wait for the headers and is done here; the
    // body has its own limits below. The OData reads further down were bounded
    // first and this exchange was left unbounded, which is the half that talks
    // to the host the caller named.
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await readBoundedBody(response, TOKEN_BODY_LIMITS).catch(() => '');
      // The body stays out of the answer and the log. This message is handed straight to the
      // caller by `buildAuthHeaders`' catch below ("Authentication failed:
      // …"), so quoting the token endpoint verbatim passed 200 characters from
      // a host the caller merely *named* back out through our answer — an error
      // page, a redirect target, an internal hostname, whatever was there.
      // The status is our own observation and
      // stays: it is what tells a wrong secret from an unreachable endpoint.
      logger.warn('oauth token exchange rejected', {
        route: 'api/fetch-odata-metadata',
        status: response.status,
        bodyShape: upstreamBodyShape(errorBody),
      });
      throw new Error(
        `Token endpoint returned HTTP ${response.status}. Verify Client ID and Client Secret.`
      );
    }

    const tokenData = await readBoundedJson(response, TOKEN_BODY_LIMITS);
    if (!tokenData.access_token) {
      throw new Error('Token endpoint responded but did not return an access_token.');
    }
    return tokenData;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('OAuth token request timed out after 12 seconds.');
    }
    throw err;
  }
}

// --- Helper: Parse BTP Destination JSON ---
function parseBtpDestination(jsonString: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format for the destination (SAP Destination service).');
  }

  const url = parsed.URL || parsed.url || parsed.Url;
  if (!url) throw new Error('Destination JSON is missing the "URL" field.');

  const authentication = (parsed.Authentication || parsed.authentication || '').toLowerCase();

  if (authentication === 'basicauthentication' || authentication === 'basic') {
    return {
      url,
      authType: 'basic' as const,
      username: parsed.User || parsed.user || parsed.Username || parsed.username,
      password: parsed.Password || parsed.password,
    };
  }

  if (authentication === 'oauth2clientcredentials' || authentication === 'oauth2_client_credentials') {
    return {
      url,
      authType: 'oauth2' as const,
      tokenUrl: parsed.tokenServiceURL || parsed.TokenServiceURL || parsed.tokenServiceUrl || parsed.tokenUrl,
      clientId: parsed.clientId || parsed.ClientId || parsed.clientID,
      clientSecret: parsed.clientSecret || parsed.ClientSecret,
    };
  }

  return { url, authType: 'none' as const };
}

// --- Helper: Build auth headers based on auth type ---
async function buildAuthHeaders(body: any): Promise<{ headers: Record<string, string>; resolvedUrl: string }> {
  let { url, username, password, authType, tokenUrl, btpDestinationJson } = body;

  const headers: Record<string, string> = {
    'Accept': 'application/xml,application/json',
    'User-Agent': 'CleanCore-Pilot/1.6 (OData-Metadata-Fetch)',
  };

  if (authType === 'btp_destination' && btpDestinationJson) {
    const config = parseBtpDestination(btpDestinationJson);
    url = config.url;

    if (config.authType === 'oauth2' && 'tokenUrl' in config && config.tokenUrl && 'clientId' in config && config.clientId && 'clientSecret' in config && config.clientSecret) {
      const tokenCheck = await isUrlSafe(config.tokenUrl);
      if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
      const tokenData = await fetchOAuth2Token(config.tokenUrl, config.clientId, config.clientSecret);
      headers['Authorization'] = `Bearer ${tokenData.access_token}`;
    } else if (config.authType === 'basic' && config.username && config.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
    }
  } else if (authType === 'oauth2' && tokenUrl && username && password) {
    const tokenCheck = await isUrlSafe(tokenUrl);
    if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
    const tokenData = await fetchOAuth2Token(tokenUrl, username, password);
    headers['Authorization'] = `Bearer ${tokenData.access_token}`;
  } else if (authType === 'basic' && username && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (authType === 'sap_hub' && password) {
    headers['APIKey'] = password;
  }

  return { headers, resolvedUrl: url };
}

// --- Helper: Fetch with timeout ---
// The timeout below covers the wait for the headers; the body is read
// separately under ODATA_BODY_LIMITS. The read used to follow `return
// response` with the timer already cleared, so a tenant could answer as slowly
// and as largely as it liked. The limits live in lib/url-validation.ts beside
// the reader, because the same ceiling has to hold for the three other routes
// that read from the same tenant under the same credentials.
async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await safeFetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds.`);
    }
    throw err;
  }
}

// --- XML Parser helpers (lightweight, no deps) ---

/** Extract all matches for a regex with named groups */
function extractEntityTypes(metadataXml: string) {
  const entityTypes: Array<{
    name: string;
    properties: Array<{ name: string; type: string; nullable: boolean }>;
  }> = [];

  // Match <EntityType Name="..."> ... </EntityType> blocks
  const entityTypeRegex = /<EntityType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/gi;
  let match;

  while ((match = entityTypeRegex.exec(metadataXml)) !== null) {
    const entityName = match[1];
    const entityBlock = match[2];

    const properties: Array<{ name: string; type: string; nullable: boolean }> = [];
    const propRegex = /<Property\s+([^/>]+)\/?>/gi;
    let propMatch;

    while ((propMatch = propRegex.exec(entityBlock)) !== null) {
      const attrs = propMatch[1];
      const nameMatch = attrs.match(/Name="([^"]+)"/i);
      const typeMatch = attrs.match(/Type="([^"]+)"/i);
      const nullableMatch = attrs.match(/Nullable="([^"]+)"/i);

      if (nameMatch) {
        properties.push({
          name: nameMatch[1],
          type: typeMatch ? typeMatch[1] : 'Edm.String',
          nullable: nullableMatch ? nullableMatch[1].toLowerCase() === 'true' : true,
        });
      }
    }

    entityTypes.push({ name: entityName, properties });
  }

  return entityTypes;
}

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json(
        { status: 'failed', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      return NextResponse.json(
        { status: 'failed', message: mfaRefusal(mfaErr).message || 'MFA verification required.' },
        { status: 403 }
      );
    }

    try {
      await assertS4TenantAccess(decodedToken.uid, { isAdminClaim: (decodedToken as any).admin === true });
    } catch (e: any) {
      return NextResponse.json(
        { status: 'failed', message: e.message || 'Access denied.' },
        { status: 403 }
      );
    }

    // Per account, like every other route that spends something. This one
    // spends *outbound* requests: one call fans out to up to four metadata
    // candidates against a host the body names, each
    // with a 20-second deadline. `middleware.ts` excludes `/api` from its
    // matcher, so nothing else bounded it — a single MFA-confirmed account
    // could drive unlimited outgoing fetch cycles from our address.
    // 30/h is well above what configuring a tenant takes.
    try {
      await assertRateLimit(`fetch-odata-metadata:${decodedToken.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      // Only the limiter's own refusal is repeated back — it names a retry
      // delay and nothing else. Anything else the limiter throws is about our
      // configuration (it refuses to run without a pepper) and goes to the
      // catch below, which says nothing.
      if (rateErr instanceof QuotaError) {
        return NextResponse.json({ status: 'failed', message: rateErr.message }, { status: rateErr.status });
      }
      throw rateErr;
    }

    // Connection details and at most a destination document: bounded before parsing.
    const read = await readBoundedRequestJson(req, S4_REQUEST_BODY_LIMITS);
    if (read.tooLarge) return NextResponse.json({ status: 'failed', message: 'The request is too large.' }, { status: 413 });
    if (!read.body || typeof read.body !== 'object') {
      return NextResponse.json({ status: 'failed', message: 'Expected the connection details as JSON.' }, { status: 400 });
    }
    const body = read.body as Record<string, unknown>;
    if (body.servicePath !== undefined && body.servicePath !== null && typeof body.servicePath !== 'string') {
      return NextResponse.json({ status: 'failed', message: 'Invalid service path.' }, { status: 400 });
    }
    const servicePath = typeof body.servicePath === 'string' ? body.servicePath.trim() : '';
    // No service name, no request to the tenant: without one the only thing
    // left to read would be a list of services, and that list is records of
    // the gateway catalog, not metadata (see the comment at the top).
    if (!servicePath) {
      return NextResponse.json(
        { status: 'failed', message: 'A service name is required, e.g. "API_BUSINESS_PARTNER". Only that service\'s $metadata is read.' },
        { status: 400 }
      );
    }

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

    if (!resolvedBody.url && resolvedBody.authType !== 'btp_destination') {
      return NextResponse.json(
        { status: 'failed', message: 'S/4HANA URL is required.' },
        { status: 400 }
      );
    }

    // SSRF protection: validate user-supplied URL
    if (resolvedBody.url) {
      const urlCheck = await isUrlSafe(resolvedBody.url);
      if (!urlCheck.safe) {
        return NextResponse.json(
          { status: 'failed', message: urlCheck.reason || 'URL is not allowed.' },
          { status: 403 }
        );
      }
    }

    // Build auth headers
    let headers: Record<string, string>;
    let resolvedUrl: string;
    try {
      const result = await buildAuthHeaders(resolvedBody);
      headers = result.headers;
      resolvedUrl = result.resolvedUrl;
    } catch (authErr: any) {
      return NextResponse.json(
        { status: 'failed', message: `Authentication failed: ${authErr.message}` },
        { status: 401 }
      );
    }

    // SSRF protection: validate resolved URL (may differ from body.url for BTP destinations)
    const resolvedUrlCheck = await isUrlSafe(resolvedUrl);
    if (!resolvedUrlCheck.safe) {
      return NextResponse.json(
        { status: 'failed', message: resolvedUrlCheck.reason || 'Resolved URL is not allowed.' },
        { status: 403 }
      );
    }

    // Normalize base URL
    resolvedUrl = resolvedUrl.replace(/\/+$/, '');

    // The named service's $metadata — the only thing this route requests.
    // F-08: Strict servicePath validation — only SAP service IDs allowed
    const SERVICE_PATH_REGEX = /^[A-Za-z0-9_./-]{1,120}$/;
    if (!SERVICE_PATH_REGEX.test(servicePath) || servicePath.includes('..') || servicePath.includes('?') || servicePath.includes('#')) {
      return NextResponse.json(
        { status: 'failed', message: 'Invalid service path. Only alphanumeric characters, dots, underscores, hyphens, and forward slashes are allowed (max 120 chars). No "..", "?", or "#".' },
        { status: 400 }
      );
    }

    const cleanPath = servicePath.replace(/^\/+/, '').replace(/\/\$metadata$/, '');

    // Try multiple URL patterns that SAP uses
    const urlCandidates = [
      `${resolvedUrl}/sap/opu/odata/sap/${cleanPath}/$metadata`,
      `${resolvedUrl}/sap/opu/odata4/sap/${cleanPath}/$metadata`,
      `${resolvedUrl}/${cleanPath}/$metadata`,
    ];

    // For SAP API Hub, the URL structure is different
    if (resolvedBody.authType === 'sap_hub' || resolvedUrl.includes('sandbox.api.sap.com')) {
      urlCandidates.unshift(`${resolvedUrl}${resolvedUrl.endsWith('/') ? '' : '/'}${cleanPath}/$metadata`);
    }

    let lastError = '';
    for (const candidateUrl of urlCandidates) {
      try {
        const response = await fetchWithTimeout(candidateUrl, headers);

        if (response.ok) {
          const xml = await readBoundedBody(response, ODATA_BODY_LIMITS);
          const entityTypes = extractEntityTypes(xml);

          return NextResponse.json({
            status: 'success',
            mode: 'metadata',
            servicePath: cleanPath,
            fetchedUrl: candidateUrl,
            entityTypes,
            totalEntityTypes: entityTypes.length,
            rawSizeBytes: xml.length,
          });
        }

        lastError = `HTTP ${response.status}`;
      } catch (err: any) {
        // The reason goes to the server log only; the caller gets a fixed
        // sentence.
        logger.warn('odata metadata candidate failed', {
          route: 'api/fetch-odata-metadata',
          error: errMessage(err),
        });
        lastError = 'the request did not complete';
      }
    }

    return NextResponse.json(
      {
        status: 'failed',
        message: `Could not fetch $metadata for "${cleanPath}". Last error: ${lastError}. Verify the service name exists on your tenant.`,
        triedUrls: urlCandidates,
      },
      { status: 404 }
    );
  } catch (error: any) {
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { status: 'failed', message: error.message },
        { status: error.status }
      );
    }
    // Fixed sentence outward, cause into the log — the shape
    // `app/api/secrets/gemini/test/route.ts` already uses. This used to hand
    // out 200 characters of whatever threw: a stack line, a resolver failure
    // naming an internal host, an Admin SDK message about our own collections.
    logger.error('fetch-odata-metadata failed', {
      route: 'api/fetch-odata-metadata',
      error: errMessage(error),
    });
    return NextResponse.json(
      { status: 'failed', message: 'Internal server error during metadata fetch.' },
      { status: 500 }
    );
  }
}
