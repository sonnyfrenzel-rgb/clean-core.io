import { NextRequest, NextResponse } from 'next/server';

/**
 * F-03: Content-Security-Policy Middleware
 *
 * Injects a CSP header into every HTML response.
 *
 * NOTE: Next.js does not propagate middleware-generated nonces to its <script>
 * tags without the experimental `contentSecurityPolicy` config. Therefore we
 * use 'self' + 'unsafe-inline' instead of nonce-based strict-dynamic.
 *
 * This CSP still provides significant hardening:
 *  - Blocks external script injection (only 'self' scripts allowed)
 *  - Prevents clickjacking (frame-ancestors 'none')
 *  - Blocks Flash / plugin-based attacks (object-src 'none')
 *  - Restricts form targets (form-action 'self')
 *  - Limits connect-src to known Google/Firebase domains
 *  - Enforces HTTPS in production (upgrade-insecure-requests)
 */

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

  // Skip CSP entirely in dev to avoid blocking Firebase Auth popup
  if (isDev) {
    return NextResponse.next();
  }

  // Emulator URLs needed for E2E tests (Auth: 9099, Firestore: 8080)
  const emulatorConnectSrc = useEmulator ? ' http://127.0.0.1:* http://localhost:*' : '';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://firestore.googleapis.com https://generativelanguage.googleapis.com https://securetoken.googleapis.com wss://*.firebaseio.com${emulatorConnectSrc}`,
    `frame-src 'self' https://cleancore-491216.firebaseapp.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    ...(useEmulator ? [] : [`upgrade-insecure-requests`]),
  ].join('; ');

  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

// Apply middleware to all routes except static assets, API routes, and Next.js internals
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, icon.svg (browser icons)
     * - screenshots, og-image (public assets)
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|screenshots|og-image).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
