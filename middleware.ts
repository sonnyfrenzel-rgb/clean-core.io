import { NextRequest, NextResponse } from 'next/server';
import { buildReportOnlyPolicy, createNonce, isNonceRoute } from '@/lib/csp-report-only';

/**
 * F-03: Content-Security-Policy Middleware
 *
 * Injects a CSP header into every HTML response.
 *
 * 'unsafe-inline' in script-src is a deliberate trade-off, not a framework
 * limit. Next.js can apply a per-request nonce set here (read from the request
 * header) to its own scripts, but only on dynamically rendered pages: a nonce
 * has to be new on every request, so every page would lose static rendering
 * and caching — the public pages, catalog and landing included. Firebase /
 * Google sign-in (firebaseapp.com, apis.google.com) also has to keep working
 * under whatever replaces it. A nonce-based policy is planned as a
 * report-only trial after 3.0, before anything is enforced.
 *
 * What this CSP does and does not do:
 *  - Scripts load only from 'self' and the two Google sign-in origins; inline
 *    script is NOT blocked (that is the trade-off above)
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

  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ Report-only CSP — stage 1 of the CSP rebuild (ADR-065)                  │
  // │                                                                         │
  // │ A stricter policy is sent as Content-Security-Policy-Report-Only NEXT   │
  // │ TO the enforced policy above, which is unchanged. It blocks nothing;    │
  // │ violations go to /api/csp-report and appear as `csp-report` lines in    │
  // │ the Cloud Run log. It keeps every host the Google sign-in block above   │
  // │ names. Builder and reasoning: lib/csp-report-only.ts.                   │
  // │                                                                         │
  // │ Pages rendered per request (isNonceRoute) get the nonce variant:        │
  // │ nonce + 'strict-dynamic', no 'unsafe-inline' in script-src. Static and  │
  // │ ISR pages keep their caching and today's script-src: their HTML is      │
  // │ shared by every visitor and cannot carry a per-request nonce.           │
  // │                                                                         │
  // │ Next.js copies every header this middleware sets on the response into   │
  // │ the request it renders, and reads the nonce from                        │
  // │ content-security-policy BEFORE content-security-policy-report-only. So  │
  // │ on the nonce routes the enforced policy — the SAME string — is          │
  // │ delivered by next.config.mjs headers() instead of from here; otherwise  │
  // │ Next would render its scripts without the nonce. A spec holds the two   │
  // │ strings equal and checks every nonce route still gets the enforced      │
  // │ header (tests/csp-report-only.spec.ts).                                 │
  // │                                                                         │
  // │ Incoming CSP request headers are dropped, so a client can never choose  │
  // │ the nonce Next renders, and a static page never receives one.           │
  // │                                                                         │
  // │ Enforcing anything stricter is a later step, taken only after real      │
  // │ traffic — including the real Google sign-in — shows no violations.      │
  // └─────────────────────────────────────────────────────────────────────────┘
  const nonce = isNonceRoute(request.nextUrl.pathname) ? createNonce() : undefined;
  const reportOnlyCsp = buildReportOnlyPolicy({
    nonce,
    nodeEnv: process.env.NODE_ENV,
    useEmulatorFlag: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('content-security-policy');
  requestHeaders.delete('content-security-policy-report-only');
  requestHeaders.delete('x-nonce');
  if (nonce) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy-report-only', reportOnlyCsp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // On a nonce route next.config.mjs sets this same policy (see the box above).
  if (!nonce) response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Content-Security-Policy-Report-Only', reportOnlyCsp);

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
