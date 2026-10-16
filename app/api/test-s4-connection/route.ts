import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth, assertS4TenantAccess, QuotaError, assertMfaSatisfied } from '@/lib/firebase-admin';
import { loadS4ConfigForUser, resolveS4Connection } from '@/lib/s4-credentials';
import {
  isUrlSafe,
  safeFetch,
  SsrfError,
  readBoundedBody,
  readBoundedJson,
  ResponseLimitError,
  TOKEN_BODY_LIMITS,
} from '@/lib/url-validation';
import { assertRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { upstreamBodyShape } from '@/lib/upstream-body-shape';
import { connectionProbeTarget, probeService, describeProbeStatus } from '@/lib/s4-connection-probe';

/**
 * POST /api/test-s4-connection
 *
 * Performs a real server-side connectivity check against the user-provided
 * S/4HANA tenant URL — and reads no business record (owner decision 17.10.2026).
 * The only request sent to the tenant is one GET on one
 * OData service's `$metadata` document, built by `lib/s4-connection-probe.ts`
 * from the address's origin and path prefix; the response body is cancelled
 * unread. It proves reachability, authentication and that the service exists.
 * Supports four authentication methods:
 *
 *   1. Basic Authentication (username + password → Authorization: Basic)
 *   2. SAP API Hub Sandbox Key (password → APIKey header)
 *   3. OAuth 2.0 Client Credentials (clientId + clientSecret + tokenUrl → Bearer token)
 *   4. SAP BTP Destination Service JSON (parses destination config, resolves auth automatically)
 *
 * Request body:
 *   {
 *     url: string,
 *     username?: string,
 *     password?: string,
 *     authType: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination',
 *     tokenUrl?: string,
 *     btpDestinationJson?: string
 *   }
 *
 * Response:
 *   { status: 'connected' | 'failed', message: string, httpStatus?: number, details?: object,
 *     checked?: { reachable, signedIn, serviceFound, servicePath, recordsRead: false } }
 */

// --- Helper: OAuth 2.0 Client Credentials Token Exchange ---
async function fetchOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; token_type: string; expires_in?: number }> {
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
    // body has its own limits below. Before that it had none: `clearTimeout`
    // ran and `response.text()` / `response.json()` then read whatever the
    // token endpoint sent, for as long as it kept sending — a host the caller
    // chose, holding a Cloud Run worker and its memory for as long as it liked.
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await readBoundedBody(response, TOKEN_BODY_LIMITS).catch(() => '');
      // Neither the caller nor the log gets the body: the caller the status,
      // the log the status and a shape word (SEC-2026-525; QA review of 46a7d64baad3).
      logger.warn('oauth token exchange rejected', {
        route: 'api/test-s4-connection',
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
      throw new Error('OAuth token request timed out after 12 seconds. Verify the Token URL is reachable.');
    }
    throw err;
  }
}

// --- Helper: Parse BTP Destination JSON and resolve connection parameters ---
interface BtpDestinationConfig {
  url: string;
  authType: 'basic' | 'oauth2' | 'none';
  username?: string;
  password?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

function parseBtpDestination(jsonString: string): BtpDestinationConfig {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format. Please paste a valid SAP Destination service JSON export.');
  }

  // Standard BTP Destination Service fields:
  // URL, Authentication, User, Password, tokenServiceURL, clientId, clientSecret,
  // tokenServiceURLType, ProxyType, Type, Name
  const url = parsed.URL || parsed.url || parsed.Url;
  if (!url) {
    throw new Error('Destination JSON is missing the "URL" field. This is required.');
  }

  if (!url.startsWith('https://')) {
    throw new Error(`Destination URL "${url}" must use HTTPS protocol.`);
  }

  const authentication = (parsed.Authentication || parsed.authentication || '').toLowerCase();

  if (authentication === 'basicauthentication' || authentication === 'basic') {
    const user = parsed.User || parsed.user || parsed.Username || parsed.username;
    const pass = parsed.Password || parsed.password;
    if (!user || !pass) {
      throw new Error('Destination uses BasicAuthentication but is missing "User" or "Password" fields.');
    }
    return { url, authType: 'basic', username: user, password: pass };
  }

  if (authentication === 'oauth2clientcredentials' || authentication === 'oauth2_client_credentials') {
    const tokenUrl = parsed.tokenServiceURL || parsed.TokenServiceURL || parsed.tokenServiceUrl || parsed.tokenUrl;
    const clientId = parsed.clientId || parsed.ClientId || parsed.clientID;
    const clientSecret = parsed.clientSecret || parsed.ClientSecret;
    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error(
        'Destination uses OAuth2ClientCredentials but is missing "tokenServiceURL", "clientId", or "clientSecret".'
      );
    }
    return { url, authType: 'oauth2', tokenUrl, clientId, clientSecret };
  }

  if (authentication === 'samlassertion' || authentication === 'principalpropagation') {
    // Principal Propagation and SAML cannot be tested from a server-side call —
    // they require an end-user browser session with the Identity Provider.
    // We fall back to a URL-only reachability check.
    return { url, authType: 'none' };
  }

  if (authentication === 'noauthentication' || authentication === 'none' || !authentication) {
    return { url, authType: 'none' };
  }

  throw new Error(
    `Unsupported authentication type "${parsed.Authentication || authentication}". ` +
    'Supported: BasicAuthentication, OAuth2ClientCredentials, PrincipalPropagation, NoAuthentication.'
  );
}

export async function POST(req: NextRequest) {
  try {
    // --- Server-side auth: require a valid Firebase ID token ---
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

    // Per account, before any URL check, OAuth exchange or tenant request; the
    // same budget as the metadata routes (QA full review of fc787674705f,
    // 0e90b2d74f76).
    try {
      await assertRateLimit(`test-s4-connection:${decodedToken.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      if (rateErr instanceof QuotaError) {
        return NextResponse.json({ status: 'failed', message: rateErr.message }, { status: rateErr.status });
      }
      throw rateErr;
    }

    // Bounded like the OData read route beside it (SEC-b6716f0-19): a connection
    // form with a destination JSON is a few kilobytes, so the shared 64 KiB
    // ceiling of a token answer is ample (one pair of limits,
    // tests/bounded-body.spec.ts).
    const raw = await readBoundedBody(req, TOKEN_BODY_LIMITS).catch((bodyErr) => (bodyErr instanceof ResponseLimitError ? null : ''));
    if (raw === null) {
      return NextResponse.json({ status: 'failed', message: 'The request is too large.' }, { status: 413 });
    }
    let body: any;
    try {
      const parsed: unknown = JSON.parse(raw || 'null');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed;
    } catch {
      return NextResponse.json({ status: 'failed', message: 'Expected a JSON object.' }, { status: 400 });
    }

    // F-03: Resolve credentials — stored (server-side) or transient (from body)
    const stored = body.useStoredCredentials ? await loadS4ConfigForUser(decodedToken.uid) : null;
    // The vault is all-or-nothing: asking for stored credentials must not let
    // the request redirect them to a URL of its choosing. See resolveS4Connection.
    const { config: s4 } = resolveS4Connection(body, stored);
    const url = s4.url;
    const username = s4.username;
    const password = s4.password;
    const authType = s4.authType;
    const tokenUrl = s4.tokenUrl;
    const btpDestinationJson = s4.btpDestinationJson;

    // --- BTP Destination: parse JSON, resolve auth, and override parameters ---
    if (authType === 'btp_destination') {
      if (!btpDestinationJson) {
        return NextResponse.json(
          { status: 'failed', message: 'Destination JSON configuration is required.' },
          { status: 400 }
        );
      }

      let config: BtpDestinationConfig;
      try {
        config = parseBtpDestination(btpDestinationJson);
      } catch (parseErr: any) {
        return NextResponse.json(
          { status: 'failed', message: `Destination parsing failed: ${parseErr.message}` },
          { status: 400 }
        );
      }

      // SSRF protection: validate resolved URL
      const urlCheck = await isUrlSafe(config.url);
      if (!urlCheck.safe) {
        return NextResponse.json(
          { status: 'failed', message: urlCheck.reason || 'URL is not allowed.' },
          { status: 403 }
        );
      }

      // The one URL this test requests: the service's $metadata, never an
      // entity set (owner decision 17.10.2026, lib/s4-connection-probe.ts).
      const target = connectionProbeTarget(config.url);
      if (!target.ok) {
        return NextResponse.json({ status: 'failed', message: target.reason }, { status: 400 });
      }

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'CleanCore-Pilot/1.0 (Destination-Test)',
      };

      // Resolve authentication from parsed destination config
      if (config.authType === 'oauth2' && config.tokenUrl && config.clientId && config.clientSecret) {
        const tokenCheck = await isUrlSafe(config.tokenUrl);
        if (!tokenCheck.safe) {
          return NextResponse.json(
            { status: 'failed', message: `Token URL blocked: ${tokenCheck.reason}` },
            { status: 403 },
          );
        }
        try {
          const tokenData = await fetchOAuth2Token(config.tokenUrl, config.clientId, config.clientSecret);
          headers['Authorization'] = `Bearer ${tokenData.access_token}`;
        } catch (tokenErr: any) {
          return NextResponse.json(
            {
              status: 'failed',
              message: `OAuth2 token exchange for the destination failed: ${tokenErr.message}`,
              details: { tokenUrl: config.tokenUrl },
            },
            { status: 401 }
          );
        }
      } else if (config.authType === 'basic' && config.username && config.password) {
        const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
      // authType 'none' → no auth headers (PrincipalPropagation / NoAuthentication)

      try {
        const { httpStatus } = await probeService(target.probeUrl, headers);
        return NextResponse.json(
          describeProbeStatus(httpStatus, config.authType === 'none' ? 'none' : config.authType, target.servicePath),
        );
      } catch (connErr: any) {
        return NextResponse.json(
          { status: 'failed', message: connErr.message },
          { status: 502 }
        );
      }
    }

    // --- Standard auth types: basic, oauth2, sap_hub ---
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { status: 'failed', message: 'S/4HANA URL is required.' },
        { status: 400 }
      );
    }

    // SSRF protection: validate user-supplied URL
    const urlCheck = await isUrlSafe(url);
    if (!urlCheck.safe) {
      return NextResponse.json(
        { status: 'failed', message: urlCheck.reason || 'URL is not allowed.' },
        { status: 403 }
      );
    }

    // The one URL this test requests: the service's $metadata, never an
    // entity set (owner decision 17.10.2026, lib/s4-connection-probe.ts).
    const target = connectionProbeTarget(url);
    if (!target.ok) {
      return NextResponse.json({ status: 'failed', message: target.reason }, { status: 400 });
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'CleanCore-Pilot/1.0 (S4HANA-Connection-Test)',
    };

    // --- OAuth 2.0 Client Credentials Flow ---
    if (authType === 'oauth2') {
      if (!tokenUrl) {
        return NextResponse.json(
          { status: 'failed', message: 'OAuth 2.0 Token URL is required for Client Credentials flow.' },
          { status: 400 }
        );
      }
      if (!username || !password) {
        return NextResponse.json(
          { status: 'failed', message: 'Client ID and Client Secret are required for OAuth 2.0.' },
          { status: 400 }
        );
      }

      const tokenCheck = await isUrlSafe(tokenUrl);
      if (!tokenCheck.safe) {
        return NextResponse.json(
          { status: 'failed', message: `Token URL blocked: ${tokenCheck.reason}` },
          { status: 403 },
        );
      }
      try {
        const tokenData = await fetchOAuth2Token(tokenUrl, username, password);
        headers['Authorization'] = `Bearer ${tokenData.access_token}`;
      } catch (tokenErr: any) {
        return NextResponse.json(
          {
            status: 'failed',
            message: `OAuth 2.0 token exchange failed: ${tokenErr.message}`,
            details: { tokenUrl },
          },
          { status: 401 }
        );
      }
    }
    // --- Basic Authentication ---
    // A declared scheme without its credential is refused, not tested without
    // one: an endpoint that answers anonymous requests was otherwise reported
    // as "Connection successful via Basic Auth" with no credential sent (QA
    // full review of fc787674705f, 4f96ba27311b).
    else if (authType === 'basic') {
      if (!username || !password) {
        return NextResponse.json(
          { status: 'failed', message: 'Username and password are required for Basic Authentication.' },
          { status: 400 }
        );
      }
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
    // --- SAP API Hub Sandbox Key ---
    else if (authType === 'sap_hub') {
      if (!password) {
        return NextResponse.json(
          { status: 'failed', message: 'An API key is required for the SAP API Hub.' },
          { status: 400 }
        );
      }
      headers['APIKey'] = password;
    }

    // --- Perform the connectivity test: $metadata only, body never read ---
    try {
      const { httpStatus } = await probeService(target.probeUrl, headers);
      // No declared scheme sent no credential, so it is not described as Basic Auth.
      return NextResponse.json(describeProbeStatus(httpStatus, authType || 'none', target.servicePath));
    } catch (connErr: any) {
      const status = connErr instanceof SsrfError ? 403 : 502;
      return NextResponse.json(
        { status: 'failed', message: connErr.message },
        { status }
      );
    }
  } catch (error: any) {
    if (error instanceof QuotaError) {
      return NextResponse.json(
        { status: 'failed', message: error.message },
        { status: error.status }
      );
    }
    console.error('[test-s4-connection] Unexpected error:', error);
    return NextResponse.json(
      { status: 'failed', message: 'Internal server error during connection test.' },
      { status: 500 }
    );
  }
}
