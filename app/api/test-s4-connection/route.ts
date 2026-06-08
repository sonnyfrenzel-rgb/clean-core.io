import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/test-s4-connection
 *
 * Performs a real server-side HTTP connectivity check against the user-provided
 * S/4HANA tenant URL. Supports four authentication methods:
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
 *   { status: 'connected' | 'failed', message: string, httpStatus?: number, details?: object }
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
    const response = await fetch(tokenUrl, {
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
    throw new Error('Invalid JSON format. Please paste a valid SAP BTP Destination Service JSON export.');
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

// --- Helper: Perform the actual HTTP connectivity test ---
async function testEndpoint(
  url: string,
  headers: Record<string, string>
): Promise<{ httpStatus: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'HEAD',
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (headError: any) {
    if (headError.name === 'AbortError') {
      clearTimeout(timeout);
      throw new Error('Connection timed out after 15 seconds. Verify the URL is correct and the system is reachable.');
    }

    // Some servers don't support HEAD — try GET as fallback
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (getError: any) {
      clearTimeout(timeout);
      if (getError.name === 'AbortError') {
        throw new Error('Connection timed out after 15 seconds. Verify the URL is correct and the system is reachable.');
      }
      const errorMessage = getError.cause?.code || getError.message || 'Unknown error';
      throw new Error(`Connection failed: ${errorMessage}. Verify the URL, network configuration, and firewall rules.`);
    }
  }

  clearTimeout(timeout);
  return { httpStatus: response.status };
}

// --- Helper: Evaluate HTTP status and return appropriate response ---
function evaluateHttpStatus(httpStatus: number, authMethod: string) {
  const authLabel = authMethod === 'oauth2'
    ? 'OAuth 2.0 Bearer Token'
    : authMethod === 'basic'
      ? 'Basic Auth'
      : authMethod === 'sap_hub'
        ? 'SAP API Hub Key'
        : 'No Auth (reachability only)';

  if (httpStatus >= 200 && httpStatus < 400) {
    return NextResponse.json({
      status: 'connected',
      message: `Connection successful via ${authLabel}. S/4HANA endpoint responded with HTTP ${httpStatus}.`,
      httpStatus,
    });
  } else if (httpStatus === 401 || httpStatus === 403) {
    return NextResponse.json({
      status: 'connected',
      message: `Endpoint reachable (HTTP ${httpStatus}) via ${authLabel}. Authentication credentials were rejected — verify your credentials.`,
      httpStatus,
    });
  } else if (httpStatus === 404) {
    return NextResponse.json({
      status: 'failed',
      message: `Endpoint returned HTTP 404 (Not Found). Verify the base URL path is correct.`,
      httpStatus,
    });
  } else if (httpStatus >= 500) {
    return NextResponse.json({
      status: 'failed',
      message: `S/4HANA system returned a server error (HTTP ${httpStatus}). The system may be undergoing maintenance.`,
      httpStatus,
    });
  } else {
    return NextResponse.json({
      status: 'failed',
      message: `Unexpected response: HTTP ${httpStatus}.`,
      httpStatus,
    });
  }
}


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, username, password, authType, tokenUrl, btpDestinationJson } = body;

    // --- BTP Destination: parse JSON, resolve auth, and override parameters ---
    if (authType === 'btp_destination') {
      if (!btpDestinationJson) {
        return NextResponse.json(
          { status: 'failed', message: 'BTP Destination JSON configuration is required.' },
          { status: 400 }
        );
      }

      let config: BtpDestinationConfig;
      try {
        config = parseBtpDestination(btpDestinationJson);
      } catch (parseErr: any) {
        return NextResponse.json(
          { status: 'failed', message: `BTP Destination parsing failed: ${parseErr.message}` },
          { status: 400 }
        );
      }

      // Block production domains
      if (config.url.includes('-api.s4hana.ondemand.com')) {
        return NextResponse.json(
          { status: 'failed', message: 'Direct production tenant API endpoints are blocked in this pilot sandbox.' },
          { status: 403 }
        );
      }

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'CleanCore-Pilot/1.0 (BTP-Destination-Test)',
      };

      // Resolve authentication from parsed destination config
      if (config.authType === 'oauth2' && config.tokenUrl && config.clientId && config.clientSecret) {
        try {
          const tokenData = await fetchOAuth2Token(config.tokenUrl, config.clientId, config.clientSecret);
          headers['Authorization'] = `Bearer ${tokenData.access_token}`;
        } catch (tokenErr: any) {
          return NextResponse.json(
            {
              status: 'failed',
              message: `BTP OAuth2 token exchange failed: ${tokenErr.message}`,
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
        const { httpStatus } = await testEndpoint(config.url, headers);
        return evaluateHttpStatus(httpStatus, config.authType === 'none' ? 'none' : config.authType);
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

    if (!url.startsWith('https://')) {
      return NextResponse.json(
        { status: 'failed', message: 'URL must use secure HTTPS protocol.' },
        { status: 400 }
      );
    }

    // Block production tenant domains for safety
    if (url.includes('-api.s4hana.ondemand.com')) {
      return NextResponse.json(
        { status: 'failed', message: 'Direct production tenant API endpoints are blocked in this pilot sandbox.' },
        { status: 403 }
      );
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
    else if (authType === 'basic' && username && password) {
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
    // --- SAP API Hub Sandbox Key ---
    else if (authType === 'sap_hub' && password) {
      headers['APIKey'] = password;
    }

    // --- Perform real HTTP connectivity test ---
    try {
      const { httpStatus } = await testEndpoint(url, headers);
      return evaluateHttpStatus(httpStatus, authType || 'basic');
    } catch (connErr: any) {
      return NextResponse.json(
        { status: 'failed', message: connErr.message },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('[test-s4-connection] Unexpected error:', error);
    return NextResponse.json(
      { status: 'failed', message: 'Internal server error during connection test.' },
      { status: 500 }
    );
  }
}
