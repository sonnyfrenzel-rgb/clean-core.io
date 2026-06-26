import { NextRequest, NextResponse } from 'next/server';

/**
 * F-03: Content-Security-Policy Middleware
 *
 * Injects a strict CSP header into every HTML response.
 * Uses nonce-based script-src with 'strict-dynamic' for Next.js compatibility.
 * style-src allows 'unsafe-inline' short-term (Tailwind/Framer Motion inline styles).
 */

export function middleware(request: NextRequest) {
  // Generate a random nonce for this request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // In development, Next.js uses eval() for HMR/webpack — allow it.
  // In production, strict CSP without unsafe-eval applies.
  const isDev = process.env.NODE_ENV === 'development';

  // Build the CSP header
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://firestore.googleapis.com https://generativelanguage.googleapis.com https://securetoken.googleapis.com wss://*.firebaseio.com${isDev ? ' ws://localhost:*' : ''}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join('; ');

  // Clone the request headers and set the nonce for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set the CSP header on the response
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
