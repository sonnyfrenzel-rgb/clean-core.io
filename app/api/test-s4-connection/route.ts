import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/test-s4-connection
 *
 * Performs a real server-side HTTP connectivity check against the user-provided
 * S/4HANA tenant URL. Validates that the endpoint is reachable and responds
 * with a valid HTTP status code.
 *
 * Request body:
 *   { url: string, username?: string, password?: string, authType?: string }
 *
 * Response:
 *   { status: 'connected' | 'failed', message: string, httpStatus?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, username, password, authType } = body;

    // --- Validation ---
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

    // --- Build request headers ---
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'CleanCore-Pilot/1.0 (S4HANA-Connection-Test)',
    };

    // Add authentication headers based on auth type
    if (authType === 'basic' && username && password) {
      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (authType === 'sap_hub' && password) {
      // SAP API Hub uses APIKey header
      headers['APIKey'] = password;
    }

    // --- Perform real HTTP connectivity test ---
    // Attempt a HEAD request first (lightweight), fallback to GET if HEAD is not supported
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (headError: any) {
      // Some servers don't support HEAD — try GET as fallback
      if (headError.name === 'AbortError') {
        clearTimeout(timeout);
        return NextResponse.json(
          { status: 'failed', message: 'Connection timed out after 15 seconds. Verify the URL is correct and the system is reachable.' },
          { status: 504 }
        );
      }

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
          return NextResponse.json(
            { status: 'failed', message: 'Connection timed out after 15 seconds. Verify the URL is correct and the system is reachable.' },
            { status: 504 }
          );
        }

        // Network-level failures (DNS, TLS, connection refused)
        const errorMessage = getError.cause?.code || getError.message || 'Unknown error';
        return NextResponse.json(
          { status: 'failed', message: `Connection failed: ${errorMessage}. Verify the URL, network configuration, and firewall rules.` },
          { status: 502 }
        );
      }
    }

    clearTimeout(timeout);

    // --- Evaluate HTTP response ---
    const httpStatus = response.status;

    if (httpStatus >= 200 && httpStatus < 400) {
      return NextResponse.json({
        status: 'connected',
        message: `Connection successful. S/4HANA endpoint responded with HTTP ${httpStatus}.`,
        httpStatus,
      });
    } else if (httpStatus === 401 || httpStatus === 403) {
      // Authentication failed but server is reachable — partial success
      return NextResponse.json({
        status: 'connected',
        message: `Endpoint reachable (HTTP ${httpStatus}). Authentication credentials were rejected — verify your username/password or API key.`,
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
  } catch (error: any) {
    console.error('[test-s4-connection] Unexpected error:', error);
    return NextResponse.json(
      { status: 'failed', message: 'Internal server error during connection test.' },
      { status: 500 }
    );
  }
}
