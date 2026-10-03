/**
 * The strict Content-Security-Policy, delivered as REPORT-ONLY (stage 1 of the
 * CSP rebuild, ADR-065).
 *
 * It is sent next to the enforced policy in `middleware.ts`, which stays as it
 * is. A report-only policy blocks nothing: the browser evaluates it, reports
 * what it would have blocked to `/api/csp-report`, and loads the page anyway.
 * That is the point of this stage — nobody can be locked out by it, and what
 * the strict policy would break becomes measurable before anything is enforced.
 *
 * Two variants, chosen by route:
 *
 *  - Nonce routes (`isNonceRoute`): the pages Next renders per request today
 *    (the `ƒ` rows of the build's route table). They get
 *    `script-src 'self' 'nonce-…' 'strict-dynamic'` and no `'unsafe-inline'`.
 *    Next.js reads the nonce from the request's
 *    `content-security-policy-report-only` header and puts it on its own
 *    `<script>` tags; scripts those scripts load are trusted through
 *    `'strict-dynamic'`. Next only does that when no
 *    `content-security-policy` header without a nonce reaches the render
 *    first — which is why the middleware switches this variant on only where
 *    it does not set the enforced policy itself (`middleware.ts`, ADR-065).
 *
 *  - Every other page is statically rendered or ISR (the landing, catalog,
 *    knowledge pages, and also the dashboard, a client page prerendered as a
 *    static shell). Its HTML is produced once and served to everybody,
 *    so it cannot carry a per-request nonce, and giving it one would mean
 *    rendering it on every request — a caching and performance change this
 *    stage deliberately does not make. Those routes get the same strict
 *    policy for every directive except `script-src`, which stays at today's
 *    enforced value. Sending them the nonce policy would only report every
 *    one of Next's inline bootstrap scripts on every page view, which drowns
 *    the signal this stage exists to collect; and a hash list is not an
 *    option because those inline scripts differ per page and per build.
 *    What is left open for static pages is recorded in ADR-065.
 *
 * `style-src` keeps `'unsafe-inline'` in both variants. Tailwind, `motion` and
 * `next/font` write inline styles and style attributes, so removing it is its
 * own question and not part of this stage.
 *
 * This module is imported by the middleware (edge runtime): no Node imports.
 */

/** The browser's reporting group name, declared in `Reporting-Endpoints`. */
export const CSP_REPORT_GROUP = 'csp-endpoint';
/** Where both `report-uri` and `report-to` deliver. Excluded from the middleware matcher (`/api`). */
export const CSP_REPORT_PATH = '/api/csp-report';

/** The Firebase auth domain (firebase-config.json `authDomain`). Required for Google sign-in, see middleware.ts. */
const FIREBASE_AUTH_ORIGIN = 'https://cleancore-491216.firebaseapp.com';
/** Google's OAuth client library loaded by the auth handler, see middleware.ts. */
const GOOGLE_APIS_ORIGIN = 'https://apis.google.com';

/**
 * The hosts the browser actually talks to, named instead of wildcarded.
 *
 * The enforced policy allows `https://*.googleapis.com`, `https://*.firebaseio.com`
 * and `wss://*.firebaseio.com`. The app uses Firebase Auth and Firestore only
 * (`lib/firebase.ts`; no Realtime Database, Storage or Analytics), and Gemini is
 * reached through `/api/gemini`, never from the browser — so the Realtime
 * Database wildcards and the Gemini host are not needed here. A host missing
 * from this list shows up as a `connect-src` report, which is what this stage
 * is for.
 */
const CONNECT_HOSTS = [
  'https://identitytoolkit.googleapis.com', // Firebase Auth REST
  'https://securetoken.googleapis.com', // ID token refresh
  'https://firestore.googleapis.com', // Firestore (long polling)
  GOOGLE_APIS_ORIGIN,
  'https://accounts.google.com', // OAuth token exchange, see middleware.ts (5.)
];

export interface ReportOnlyPolicyInput {
  /** Per-request nonce (base64). Absent → the static-route variant. */
  nonce?: string;
  /** `process.env.NODE_ENV` */
  nodeEnv: string | undefined;
  /** `process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR` */
  useEmulatorFlag: string | undefined;
}

/**
 * Emulator hosts are allowed only for a local, non-production build that was
 * built for the emulators. A production build never relaxes, whatever the flag
 * says (SEC-2026-645, SEC-2026-580).
 */
export function emulatorRelaxationAllowed(nodeEnv: string | undefined, useEmulatorFlag: string | undefined): boolean {
  return useEmulatorFlag === 'true' && nodeEnv !== 'production';
}

/** The report-only policy for one response. */
export function buildReportOnlyPolicy({ nonce, nodeEnv, useEmulatorFlag }: ReportOnlyPolicyInput): string {
  const emulator = emulatorRelaxationAllowed(nodeEnv, useEmulatorFlag)
    ? ' http://127.0.0.1:9099 http://127.0.0.1:8080 http://localhost:9099 http://localhost:8080'
    : '';

  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${FIREBASE_AUTH_ORIGIN} ${GOOGLE_APIS_ORIGIN}`
    : // Static/ISR pages: today's enforced script-src, see the module comment.
      `script-src 'self' 'unsafe-inline' ${FIREBASE_AUTH_ORIGIN} ${GOOGLE_APIS_ORIGIN}`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `script-src-attr 'none'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' ${CONNECT_HOSTS.join(' ')}${emulator}`,
    `frame-src 'self' ${FIREBASE_AUTH_ORIGIN} https://accounts.google.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    // `upgrade-insecure-requests` is ignored in a report-only policy, so it is
    // not repeated here; the enforced policy carries it.
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ');
}

/**
 * A fresh nonce: 16 random bytes, base64. Web Crypto, so it runs in the edge
 * middleware.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * The pages Next renders per request today — the `ƒ (Dynamic)` page rows of
 * the `next build` route table (03.10.2026): a project and its seven stages,
 * an invitation, the auth action and unsubscribe pages, a survey, and one
 * admin preview that reads `searchParams`.
 *
 * Not the pages that merely say `export const dynamic = 'force-dynamic'`: in a
 * `'use client'` page that export has no effect, and `/dashboard` and
 * `/verify-pack` are prerendered as static HTML despite it (`○` in the table).
 *
 * `tests/csp-report-only.spec.ts` derives the per-request set from the source
 * by the same rules Next applies and fails if this list and the pages drift
 * apart in either direction: a missing entry loses the nonce trial for that
 * page, and an extra entry would hand a request's nonce to a page whose HTML
 * is cached and served to everyone.
 */
const NONCE_ROUTES: readonly RegExp[] = [
  /^\/project\/[^/]+(?:\/(?:analyze|delivery|design|documentation|tco|testing|transformation))?\/?$/,
  /^\/invitation\/[^/]+\/[^/]+\/?$/,
  /^\/auth\/action\/?$/,
  /^\/survey\/[^/]+\/?$/,
  /^\/unsubscribe\/?$/,
  /^\/admin\/design-system\/first-render\/?$/,
];

export function isNonceRoute(pathname: string): boolean {
  return NONCE_ROUTES.some((re) => re.test(pathname));
}
