import { NextRequest, NextResponse } from 'next/server';
import { isUrlSafe, safeFetch, SsrfError } from '@/lib/url-validation';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';

/**
 * POST /api/fetch-odata-metadata
 *
 * Fetches OData service metadata from an S/4HANA tenant. Two modes:
 *
 *   1. **Catalog Mode** (no `servicePath`):
 *      Queries the OData Service Catalog at
 *      `/sap/opu/odata/iwfnd/catalogservice;v=2/ServiceCollection`
 *      to list all available OData services.
 *
 *   2. **Metadata Mode** (`servicePath` provided):
 *      Fetches `$metadata` XML for a specific OData service and parses
 *      EntityTypes, Properties, Associations, and Function Imports.
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
 * Response (Catalog Mode):
 *   {
 *     status: 'success',
 *     mode: 'catalog',
 *     services: [{ title, path, serviceUrl }],
 *     totalServices: number
 *   }
 *
 * Response (Metadata Mode):
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

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Token endpoint returned HTTP ${response.status}. ${errorBody ? `Response: ${errorBody.substring(0, 200)}` : 'Verify Client ID and Client Secret.'}`
      );
    }

    const tokenData = await response.json();
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
    throw new Error('Invalid JSON format for BTP Destination.');
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
async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await safeFetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow',
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

/** Extract OData services from catalog JSON response */
function extractServicesFromCatalogJson(data: any) {
  const results = data?.d?.results || data?.d?.EntitySets || data?.value || [];
  if (!Array.isArray(results)) return [];

  return results
    .map((svc: any) => ({
      title: svc.Title || svc.Description || svc.ID || svc.ServiceName || svc.name || 'Unknown',
      path: svc.TechnicalServiceName || svc.ServiceUrl || svc.ID || svc.name || '',
      serviceUrl: svc.ServiceUrl || svc.MetadataUrl || '',
    }))
    .filter((s: any) => s.path);
}

/** Extract OData services from catalog XML (Atom feed) */
function extractServicesFromCatalogXml(xml: string) {
  const services: Array<{ title: string; path: string; serviceUrl: string }> = [];

  // Try <entry> based Atom format (SAP standard)
  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  let entryMatch;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entry = entryMatch[0];
    const titleMatch = entry.match(/<d:Title[^>]*>([^<]+)<\/d:Title>/i)
      || entry.match(/<title[^>]*>([^<]+)<\/title>/i);
    const techNameMatch = entry.match(/<d:TechnicalServiceName[^>]*>([^<]+)<\/d:TechnicalServiceName>/i)
      || entry.match(/<d:ID[^>]*>([^<]+)<\/d:ID>/i);
    const urlMatch = entry.match(/<d:ServiceUrl[^>]*>([^<]+)<\/d:ServiceUrl>/i);

    if (techNameMatch) {
      services.push({
        title: titleMatch ? titleMatch[1] : techNameMatch[1],
        path: techNameMatch[1],
        serviceUrl: urlMatch ? urlMatch[1] : '',
      });
    }
  }

  // Fallback: try <collection> based format (older systems)
  if (services.length === 0) {
    const collectionRegex = /<collection\s+href="([^"]+)"[\s\S]*?(?:<atom:title[^>]*>([^<]*)<\/atom:title>)?[\s\S]*?<\/collection>/gi;
    let colMatch;
    while ((colMatch = collectionRegex.exec(xml)) !== null) {
      services.push({
        title: colMatch[2] || colMatch[1],
        path: colMatch[1],
        serviceUrl: colMatch[1],
      });
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
    const { servicePath } = body;

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

    // ─────────────────────────────────────────────────────────
    // MODE 1: Specific service $metadata
    // ─────────────────────────────────────────────────────────
    if (servicePath) {
      const cleanPath = servicePath.replace(/^\/+/, '').replace(/\/\$metadata$/, '');
      
      // Try multiple URL patterns that SAP uses
      const urlCandidates = [
        `${resolvedUrl}/sap/opu/odata/sap/${cleanPath}/$metadata`,
        `${resolvedUrl}/sap/opu/odata4/sap/${cleanPath}/$metadata`,
        `${resolvedUrl}/${cleanPath}/$metadata`,
      ];

      // For SAP API Hub, the URL structure is different
      if (body.authType === 'sap_hub' || resolvedUrl.includes('sandbox.api.sap.com')) {
        urlCandidates.unshift(`${resolvedUrl}${resolvedUrl.endsWith('/') ? '' : '/'}${cleanPath}/$metadata`);
      }

      let lastError = '';
      for (const candidateUrl of urlCandidates) {
        try {
          const response = await fetchWithTimeout(candidateUrl, headers);

          if (response.ok) {
            const xml = await response.text();
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

          lastError = `HTTP ${response.status} from ${candidateUrl}`;
        } catch (err: any) {
          lastError = err.message;
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
    }

    // ─────────────────────────────────────────────────────────
    // MODE 2: Service Catalog discovery
    // ─────────────────────────────────────────────────────────
    const catalogPaths = [
      '/sap/opu/odata/iwfnd/catalogservice;v=2/ServiceCollection?$format=json',
      '/sap/opu/odata/iwfnd/catalogservice;v=2/ServiceCollection',
      '/sap/opu/odata/IWFND/CATALOGSERVICE;v=0002/ServiceCollection?$format=json',
      '/sap/opu/odata4/iwfnd/config/default/iwfnd/catalog/0002/ServiceGroups?$format=json',
    ];

    for (const catalogPath of catalogPaths) {
      const catalogUrl = `${resolvedUrl}${catalogPath}`;
      try {
        const response = await fetchWithTimeout(catalogUrl, headers);

        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();

        let services: Array<{ title: string; path: string; serviceUrl: string }> = [];

        if (contentType.includes('json')) {
          try {
            const json = JSON.parse(body);
            services = extractServicesFromCatalogJson(json);
          } catch {
            // Not valid JSON, try XML
          }
        }

        if (services.length === 0 && (contentType.includes('xml') || body.trim().startsWith('<'))) {
          services = extractServicesFromCatalogXml(body);
        }

        if (services.length > 0) {
          return NextResponse.json({
            status: 'success',
            mode: 'catalog',
            services: services.slice(0, 200), // cap at 200 services
            totalServices: services.length,
            catalogUrl,
          });
        }
      } catch {
        // Try next path
        continue;
      }
    }

    // Catalog not accessible — return helpful message
    return NextResponse.json({
      status: 'partial',
      mode: 'catalog',
      message: 'Service catalog endpoint not accessible. This is common when the Communication Arrangement does not include IWFND_CATALOGSERVICE. You can still fetch metadata for specific services by providing a service name (e.g. "API_BUSINESS_PARTNER").',
      services: [],
      totalServices: 0,
      suggestedServices: [
        { title: 'Business Partner', path: 'API_BUSINESS_PARTNER', serviceUrl: '' },
        { title: 'Sales Order', path: 'API_SALES_ORDER_SRV', serviceUrl: '' },
        { title: 'Purchase Order', path: 'API_PURCHASEORDER_PROCESS_SRV', serviceUrl: '' },
        { title: 'Product Master', path: 'API_PRODUCT_SRV', serviceUrl: '' },
        { title: 'Cost Center', path: 'API_COSTCENTER_SRV', serviceUrl: '' },
        { title: 'Journal Entry', path: 'API_JOURNALENTRYITEMBASIC_SRV', serviceUrl: '' },
        { title: 'Material Document', path: 'API_MATERIAL_DOCUMENT_SRV', serviceUrl: '' },
        { title: 'GL Account', path: 'API_GLACCOUNTINCHARTOFACCOUNTS_SRV', serviceUrl: '' },
      ],
    });
  } catch (error: any) {
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { status: 'failed', message: error.message },
        { status: error.status }
      );
    }
    console.error('[fetch-odata-metadata] Unexpected error:', error);
    return NextResponse.json(
      { status: 'failed', message: `Internal server error: ${(error.message || '').substring(0, 200)}` },
      { status: 500 }
    );
  }
}
