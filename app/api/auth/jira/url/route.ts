import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyRequestAuth, assertMfaSatisfied } from '@/lib/firebase-admin';

/**
 * GET /api/auth/jira/url
 *
 * Builds the Atlassian authorization URL. F-14 hardening:
 *  - CSRF state is a cryptographically random value (never a fixed literal),
 *    stored in an httpOnly cookie and verified in the callback.
 *  - The initiating user's uid is stored in an httpOnly cookie so the callback
 *    can associate the resulting tokens with the right account.
 *  - client_secret is NEVER sent here; the token exchange happens server-side
 *    in the callback.
 */
export async function GET(request: Request) {
  const decodedToken = await verifyRequestAuth(request);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    await assertMfaSatisfied(request, decodedToken);
  } catch (mfaErr: any) {
    return NextResponse.json({ error: mfaErr.message || 'MFA verification required.' }, { status: 403 });
  }

  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/jira/callback`;

  const state = randomBytes(32).toString('hex');

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.JIRA_CLIENT_ID || '',
    scope: 'read:jira-work write:jira-work read:jira-user offline_access',
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });

  const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;

  const res = NextResponse.json({ url: authUrl });
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600, // 10 minutes to complete the flow
  };
  res.cookies.set('jira_oauth_state', state, cookieOpts);
  res.cookies.set('jira_oauth_uid', decodedToken.uid, cookieOpts);
  return res;
}
