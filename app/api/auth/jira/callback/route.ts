import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // We can get the code from the query string
  // const { searchParams } = new URL(request.url);
  // const code = searchParams.get('code');
  
  // Here we would exchange the code for an access token
  // For now, we mock the success response to the parent window

  const html = `
    <html>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column;">
        <h2 style="color: #4CAF50;">Jira Authentication Successful</h2>
        <p>Connecting your account...</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'JIRA_AUTH_SUCCESS' }, '*');
            setTimeout(() => window.close(), 1000);
          } else {
            window.location.href = '/';
          }
        </script>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      // Required for cross-origin iframe
      'Set-Cookie': 'jira_connected=true; Secure; SameSite=None; HttpOnly; Path=/'
    },
  });
}
