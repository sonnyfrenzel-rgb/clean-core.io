import { NextRequest, NextResponse } from 'next/server';
import { isUrlSafe, safeFetch, SsrfError } from '@/lib/url-validation';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';

/**
 * POST /api/fetch-s4-metadata
 *
 * Fetches the OData $metadata document from an S/4HANA tenant to prove
 * real integration beyond a simple ping. Parses the XML response and
 * extracts EntityType names as available OData services.
 *
 * Supports the same auth methods as /api/test-s4-connection:
 *   - Basic Authentication
 *   - OAuth 2.0 Client Credentials
 *   - SAP API Hub Sandbox Key
 *   - SAP BTP Destination Service JSON
 *
 * Request body:
 *   {
 *     url: string,
 *     username?: string,
 *     password?: string,
 *     authType: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination',
 *     tokenUrl?: string,
 *     btpDestinationJson?: string,
 *     servicePath?: string  // defaults to /sap/opu/odata/sap/API_BUSINESS_PARTNER
 *   }
 *
 * Response:
 *   {
 *     status: 'success' | 'failed',
 *     message: string,
 *     services?: { name: string; type: 'EntityType' | 'EntitySet' | 'FunctionImport' }[],
 *     serviceCount?: number,
 *     rawMetadataPreview?: string
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

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Token endpoint returned HTTP ${response.status}. ${errorBody ? `Response: ${errorBody.substring(0, 200)}` : ''}`
      );
    }

    const tokenData = await response.json();
    if (!tokenData.access_token) {
      throw new Error('Token endpoint did not return an access_token.');
    }
    return tokenData;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('OAuth token request timed out after 12s.');
    }
    throw err;
  }
}

// --- Helper: Parse BTP Destination JSON ---
function parseBtpDestination(jsonString: string): {
  url: string;
  authType: 'basic' | 'oauth2' | 'none';
  username?: string;
  password?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
} {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format in BTP Destination config.');
  }

  const url = parsed.URL || parsed.url || parsed.Url;
  if (!url) throw new Error('Destination JSON is missing the "URL" field.');

  const authentication = (parsed.Authentication || parsed.authentication || '').toLowerCase();

  if (authentication === 'basicauthentication' || authentication === 'basic') {
    return {
      url,
      authType: 'basic',
      username: parsed.User || parsed.user || parsed.Username || parsed.username,
      password: parsed.Password || parsed.password,
    };
  }

  if (authentication === 'oauth2clientcredentials' || authentication === 'oauth2_client_credentials') {
    return {
      url,
      authType: 'oauth2',
      tokenUrl: parsed.tokenServiceURL || parsed.TokenServiceURL || parsed.tokenUrl,
      clientId: parsed.clientId || parsed.ClientId,
      clientSecret: parsed.clientSecret || parsed.ClientSecret,
    };
  }

  return { url, authType: 'none' };
}

// --- Helper: Build auth headers based on config ---
async function buildAuthHeaders(body: any): Promise<{ headers: Record<string, string>; targetUrl: string }> {
  const headers: Record<string, string> = {
    'Accept': 'application/xml',
    'User-Agent': 'CleanCore-Pilot/1.0 (OData-Metadata-Fetch)',
  };

  let targetUrl = body.url;

  if (body.authType === 'btp_destination' && body.btpDestinationJson) {
    const config = parseBtpDestination(body.btpDestinationJson);
    targetUrl = config.url;

    if (config.authType === 'oauth2' && config.tokenUrl && config.clientId && config.clientSecret) {
      const tokenCheck = await isUrlSafe(config.tokenUrl);
      if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
      const tokenData = await fetchOAuth2Token(config.tokenUrl, config.clientId, config.clientSecret);
      headers['Authorization'] = `Bearer ${tokenData.access_token}`;
    } else if (config.authType === 'basic' && config.username && config.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
    }
  } else if (body.authType === 'oauth2' && body.tokenUrl && body.username && body.password) {
    const tokenCheck = await isUrlSafe(body.tokenUrl);
    if (!tokenCheck.safe) throw new Error(`Token URL blocked: ${tokenCheck.reason}`);
    const tokenData = await fetchOAuth2Token(body.tokenUrl, body.username, body.password);
    headers['Authorization'] = `Bearer ${tokenData.access_token}`;
  } else if (body.authType === 'basic' && body.username && body.password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${body.username}:${body.password}`).toString('base64')}`;
  } else if (body.authType === 'sap_hub' && body.password) {
    headers['APIKey'] = body.password;
  }

  return { headers, targetUrl };
}

// --- Helper: Extract service names from OData $metadata XML ---
function parseMetadataXml(xmlText: string): { name: string; type: 'EntityType' | 'EntitySet' | 'FunctionImport' }[] {
  const services: { name: string; type: 'EntityType' | 'EntitySet' | 'FunctionImport' }[] = [];
  const seen = new Set<string>();

  // Extract EntityType names
  const entityTypeRegex = /<EntityType\s+Name="([^"]+)"/gi;
  let match;
  while ((match = entityTypeRegex.exec(xmlText)) !== null) {
    const name = match[1];
    if (!seen.has(`ET:${name}`)) {
      seen.add(`ET:${name}`);
      services.push({ name, type: 'EntityType' });
    }
  }

  // Extract EntitySet names
  const entitySetRegex = /<EntitySet\s+Name="([^"]+)"/gi;
  while ((match = entitySetRegex.exec(xmlText)) !== null) {
    const name = match[1];
    if (!seen.has(`ES:${name}`)) {
      seen.add(`ES:${name}`);
      services.push({ name, type: 'EntitySet' });
    }
  }

  // Extract FunctionImport names
  const funcImportRegex = /<FunctionImport\s+Name="([^"]+)"/gi;
  while ((match = funcImportRegex.exec(xmlText)) !== null) {
    const name = match[1];
    if (!seen.has(`FI:${name}`)) {
      seen.add(`FI:${name}`);
      services.push({ name, type: 'FunctionImport' });
    }
  }

  return services;
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
    } catch (mfaErr: any) {
      return NextResponse.json(
        { status: 'failed', message: mfaErr.message || 'MFA verification required.' },
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

    const body = await req.json();

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
    const { url, authType, btpDestinationJson } = resolvedBody;

    // Validate that we have a URL (either direct or from BTP destination)
    if (!url && !(authType === 'btp_destination' && btpDestinationJson)) {
      return NextResponse.json(
        { status: 'failed', message: 'S/4HANA URL is required.' },
        { status: 400 }
      );
    }

    // Build authentication headers
    let targetUrl: string;
    let authHeaders: Record<string, string>;

    try {
      const result = await buildAuthHeaders(resolvedBody);
      targetUrl = result.targetUrl;
      authHeaders = result.headers;
    } catch (authErr: any) {
      return NextResponse.json(
        { status: 'failed', message: `Authentication failed: ${authErr.message}` },
        { status: 401 }
      );
    }

    // SSRF protection: validate resolved URL before any fetch
    const urlCheck = await isUrlSafe(targetUrl);
    if (!urlCheck.safe) {
      return NextResponse.json(
        { status: 'failed', message: urlCheck.reason || 'URL is not allowed.' },
        { status: 403 }
      );
    }

    // Build the $metadata URL
    const servicePath = body.servicePath || '/sap/opu/odata/sap/API_BUSINESS_PARTNER';
    const baseUrl = targetUrl.replace(/\/$/, '');
    const metadataUrl = `${baseUrl}${servicePath}/$metadata`;

    // Fetch the $metadata document
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let response: Response;
    try {
      response = await safeFetch(metadataUrl, {
        method: 'GET',
        headers: authHeaders,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { status: 'failed', message: 'Metadata request timed out after 20s. Verify the endpoint is reachable.' },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { status: 'failed', message: `Connection failed: ${fetchErr.cause?.code || fetchErr.message}` },
        { status: 502 }
      );
    }

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return NextResponse.json({
        status: 'failed',
        message: `Metadata endpoint returned HTTP ${response.status}. ${
          response.status === 401 ? 'Authentication rejected — verify credentials.' :
          response.status === 403 ? 'Access forbidden — check authorization roles.' :
          response.status === 404 ? `Service path not found: ${servicePath}. Try a different OData service path.` :
          errorBody ? errorBody.substring(0, 300) : 'Unexpected server response.'
        }`,
        httpStatus: response.status,
      });
    }

    // Read the XML response
    const xmlText = await response.text();

    if (!xmlText || xmlText.length < 50) {
      return NextResponse.json({
        status: 'failed',
        message: 'Server returned an empty or invalid response. The service path may be incorrect.',
      });
    }

    // Check if it's actually XML/metadata
    if (!xmlText.includes('<edmx:Edmx') && !xmlText.includes('<Edmx') && !xmlText.includes('EntityType')) {
      return NextResponse.json({
        status: 'failed',
        message: 'Response is not a valid OData $metadata document. Verify the service path.',
        rawMetadataPreview: xmlText.substring(0, 500),
      });
    }

    // Parse the metadata to extract service names
    const services = parseMetadataXml(xmlText);

    if (services.length === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'Metadata document received but no EntityTypes or EntitySets could be parsed.',
        services: [],
        serviceCount: 0,
        rawMetadataPreview: xmlText.substring(0, 500),
      });
    }

    return NextResponse.json({
      status: 'success',
      message: `Successfully retrieved OData metadata. Found ${services.length} service artifacts.`,
      services,
      serviceCount: services.length,
      rawMetadataPreview: xmlText.substring(0, 1000),
    });

  } catch (error: any) {
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { status: 'failed', message: error.message },
        { status: error.status }
      );
    }
    console.error('[fetch-s4-metadata] Unexpected error:', error);
    return NextResponse.json(
      { status: 'failed', message: 'Internal server error during metadata fetch.' },
      { status: 500 }
    );
  }
}
