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

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ CSP — Content Security Policy                                          │
  // │                                                                         │
  // │ ⚠️  CRITICAL: Firebase Auth (Google Sign-In) depends on FOUR CSP        │
  // │     directives. Removing any of them silently breaks Google login       │
  // │     with `auth/internal-error` — NO visible error in the UI.           │
  // │                                                                         │
  // │ Required for Google Sign-In (signInWithPopup):                          │
  // │                                                                         │
  // │  1. script-src — cleancore-491216.firebaseapp.com                      │
  // │     The hidden auth iframe (/__/auth/iframe) loads JS from this domain. │
  // │     Without it, the iframe renders but its scripts are blocked → the    │
  // │     popup never opens and Firebase throws auth/internal-error.          │
  // │                                                                         │
  // │  2. script-src — apis.google.com                                        │
  // │     Google's OAuth client library loaded by the auth handler.           │
  // │                                                                         │
  // │  3. frame-src — cleancore-491216.firebaseapp.com                       │
  // │     Firebase SDK embeds a hidden <iframe> from this domain for          │
  // │     cross-origin auth state management via postMessage.                 │
  // │                                                                         │
  // │  4. frame-src — accounts.google.com                                     │
  // │     The Google account chooser / consent popup.                         │
  // │                                                                         │
  // │  5. connect-src — accounts.google.com                                   │
  // │     XHR/fetch calls during the OAuth token exchange.                    │
  // │                                                                         │
  // │ How signInWithPopup works:                                              │
  // │   App (clean-core.io)                                                   │
  // │     └─ loads hidden iframe (firebaseapp.com/__/auth/iframe) [frame-src] │
  // │         └─ iframe runs JS [script-src]                                  │
  // │             └─ opens popup to accounts.google.com [frame-src]           │
  // │                 └─ user authenticates                                   │
  // │                     └─ popup redirects to /__/auth/handler              │
  // │                         └─ postMessage back to iframe → app             │
  // │                                                                         │
  // │ DO NOT tighten script-src or frame-src without testing Google login!    │
  // └─────────────────────────────────────────────────────────────────────────┘
  const csp = [
    `default-src 'self'`,
    // ⚠️ See CSP documentation block above — these domains are REQUIRED for Google Sign-In
    `script-src 'self' 'unsafe-inline' https://cleancore-491216.firebaseapp.com https://apis.google.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://firestore.googleapis.com https://generativelanguage.googleapis.com https://securetoken.googleapis.com https://accounts.google.com wss://*.firebaseio.com${emulatorConnectSrc}`,
    `frame-src 'self' https://cleancore-491216.firebaseapp.com https://accounts.google.com`,
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
