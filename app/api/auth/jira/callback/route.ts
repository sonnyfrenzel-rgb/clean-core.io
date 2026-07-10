import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * GET /api/auth/jira/callback
 *
 * F-14 hardening:
 *  - Verifies the OAuth `state` against the httpOnly cookie set in /url (CSRF).
 *  - Exchanges the code for tokens SERVER-SIDE; client_secret never reaches the
 *    browser, and tokens are never returned to the browser.
 *  - postMessage targets the specific app origin (never '*').
 */

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function readCookie(request: Request, name: string): string | undefined {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) {
      return valueParts.join('=');
    }
  }
  return undefined;
}

function resultPage(ok: boolean, appOrigin: string): string {
  const type = ok ? 'JIRA_AUTH_SUCCESS' : 'JIRA_AUTH_ERROR';
  return `<!doctype html><html><body style="font-family: sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; flex-direction:column;">
    <h2 style="color:${ok ? '#10b981' : '#dc2626'};">Jira Authentication ${ok ? 'Successful' : 'Failed'}</h2>
    <p>${ok ? 'Connecting your account…' : 'You can close this window and try again.'}</p>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: ${JSON.stringify(type)} }, ${JSON.stringify(appOrigin)});
        setTimeout(function(){ window.close(); }, 1000);
      } else {
        window.location.href = '/';
      }
    </script>
  </body></html>`;
}

const CLEAR_COOKIES = [
  'jira_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  'jira_oauth_uid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
];

function htmlResponse(ok: boolean, appOrigin: string, status = ok ? 200 : 400) {
  const headers = new Headers({ 'Content-Type': 'text/html' });
  for (const c of CLEAR_COOKIES) headers.append('Set-Cookie', c);
  return new NextResponse(resultPage(ok, appOrigin), { status, headers });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appOrigin = url.origin;
  // F-19: integration not GA (token persistence unimplemented) — never simulate success.
  if (process.env.JIRA_INTEGRATION_ENABLED !== 'true') {
    return htmlResponse(false, appOrigin, 404);
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // CSRF: state must match the httpOnly cookie set when the flow started.
  const cookieState = readCookie(request, 'jira_oauth_state');
  const uid = readCookie(request, 'jira_oauth_uid');
  const stateOk = !!state && !!cookieState && safeEqual(state, cookieState);

  if (!code || !stateOk || !uid) {
    return htmlResponse(false, appOrigin, 400);
  }

  // Server-side token exchange — client_secret stays on the server.
  try {
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: `${appOrigin}/api/auth/jira/callback`,
      }),
    });

    if (!tokenRes.ok) {
      console.error('[jira-oauth] token exchange failed:', tokenRes.status);
      return htmlResponse(false, appOrigin, 502);
    }

    // const { access_token, refresh_token, expires_in } = await tokenRes.json();
    // TODO: persist tokens server-side for `uid`, ENCRYPTED and client-unreadable —
    // mirror the s4-credentials pattern (lib/s4-credentials.ts). Never return tokens
    // to the browser; never store them in a client-readable Firestore field.

    return htmlResponse(true, appOrigin, 200);
  } catch (e) {
    console.error('[jira-oauth] token exchange error:', e);
    return htmlResponse(false, appOrigin, 502);
  }
}
