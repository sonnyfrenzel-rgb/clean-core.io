import { NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  // Auth gate: only logged-in users can initiate Jira OAuth
  const decodedToken = await verifyRequestAuth(request);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // Construct the OAuth provider's authorization URL
  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/jira/callback`;

  // We are using a mock/prepare structure for Jira OAuth as requested.
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.JIRA_CLIENT_ID || 'mock_client_id',
    scope: 'read:jira-work write:jira-work read:jira-user',
    redirect_uri: redirectUri,
    state: 'random_state_string',
    response_type: 'code',
    prompt: 'consent'
  });

  const authUrl = `https://auth.atlassian.com/authorize?${params.toString()}`;

  return NextResponse.json({ url: authUrl });
}
