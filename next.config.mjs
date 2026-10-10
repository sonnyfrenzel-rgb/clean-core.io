import withBundleAnalyzer from '@next/bundle-analyzer';
import { createRequire } from 'node:module';

/**
 * Crawlers that get the page's metadata in <head>, before the body.
 *
 * Next 15 streams metadata: for a user agent outside its list of "HTML-limited
 * bots" the <title>, description, canonical and Open Graph tags arrive at the
 * end of the body once the page has rendered — measured on the dev server,
 * 394 kB into the start page for GPTBot, after the whole inline BPMN. Googlebot
 * runs JavaScript and copes; the answer-engine fetchers mostly read raw HTML,
 * often only its first part. They are added to Next's own list, which is read
 * from Next rather than copied so it keeps its updates.
 */
const require = createRequire(import.meta.url);
const { HTML_LIMITED_BOT_UA_RE } = require('next/dist/shared/lib/router/utils/html-bots.js');
const ANSWER_ENGINE_BOTS = 'GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User|CCBot|Amazonbot|meta-externalagent';
const htmlLimitedBots = new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|${ANSWER_ENGINE_BOTS}`, 'i');

/**
 * The enforced Content-Security-Policy for the pages rendered per request
 * (ADR-065, CSP rebuild stage 1b).
 *
 * `middleware.ts` sets the enforced policy for every other page, and its
 * string is the reference: this is a copy of it, and
 * `tests/csp-report-only.spec.ts` fails if the two ever differ. The policy is
 * the same; only who delivers it differs, and for one reason. Next.js copies
 * every header the middleware sets on a response into the request it renders,
 * and takes the script nonce from `content-security-policy` before
 * `content-security-policy-report-only`. Set by the middleware, the enforced
 * policy (which has no nonce) would always win, and Next would render its
 * scripts without the nonce the report-only policy is there to measure.
 * Headers from this file reach the response only, never the request.
 *
 * Not in development: the middleware sends no CSP there (the dev server needs
 * eval), and neither does this.
 */
function enforcedCsp(useEmulator) {
  const emulatorConnectSrc = useEmulator ? ' http://127.0.0.1:* http://localhost:*' : '';
  return [
    `default-src 'self'`,
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
}

/**
 * The per-request pages, as `headers()` sources. The same set as
 * `isNonceRoute` in `lib/csp-report-only.ts`; the spec checks that both name
 * exactly the same pages.
 */
export const NONCE_ROUTE_SOURCES = [
  '/project/:projectId',
  '/project/:projectId/:stage(analyze|delivery|design|documentation|tco|testing|transformation)',
  '/project/:projectId/design/requirements',
  '/invitation/:projectId/:invitationId',
  '/auth/action',
  '/survey/:token',
  '/unsubscribe',
  '/admin/design-system/first-render',
];

/** The enforced-policy header entries for the per-request pages; empty in development. */
export function nonceRouteCspHeaders(env = process.env) {
  if (env.NODE_ENV === 'development') return [];
  const value = enforcedCsp(env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true');
  return NONCE_ROUTE_SOURCES.map((source) => ({
    source,
    headers: [{ key: 'Content-Security-Policy', value }],
  }));
}

/**
 * The two PDFs and the HTML page each is the paper edition of (roadmap 3.0.8,
 * item 3). Both are rendered from that page, so they compete with it for the
 * same searches; a PDF cannot carry a `<link rel="canonical">`, so the HTTP
 * `Link` header names the page instead. A canonical rather than `noindex`: the
 * links people set to the PDFs keep counting, for the page.
 */
export const PDF_CANONICALS = {
  '/clean-core-explained.pdf': 'https://clean-core.io/clean-core-explained',
  '/Clean-Core_S4HANA_Modernization_Whitepaper.pdf': 'https://clean-core.io/whitepaper',
};

/** The `Link: <…>; rel="canonical"` header entries for the PDFs. */
export function pdfCanonicalHeaders() {
  return Object.entries(PDF_CANONICALS).map(([source, page]) => ({
    source,
    headers: [{ key: 'Link', value: `<${page}>; rel="canonical"` }],
  }));
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Do not leak the framework via the X-Powered-By header (ZAP 10037).
  poweredByHeader: false,
  // Skew protection. A tab opened before a deploy kept its webpack runtime and
  // then loaded chunks of the new build into it: "Cannot read properties of
  // undefined (reading 'call')" and "(0 , j.getAuth) is not a function" on dev
  // (owner, 02./03.10.2026). With a deployment id Next tags its assets and its
  // navigation requests, and a client of another deployment does a full page
  // load instead of mixing two builds. deploy.yml passes the commit as a build
  // variable; without one (local builds, CI's validate job) nothing changes.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  htmlLimitedBots,
  async headers() {
    return [
      ...nonceRouteCspHeaders(),
      ...pdfCanonicalHeaders(),
      {
        // API responses are JSON — lock them down with a restrictive CSP so a scanner
        // (and browsers) see an explicit policy on every /api response (ZAP 10038).
        source: '/api/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        // One address (06.10.2026): www.clean-core.io answers since the Cloud Run domain mapping of that day,
        // and every request to it moves to clean-core.io — sign-in is authorised there, and every page names it
        // as canonical. First, so it wins over the path redirects below.
        source: '/:path*',
        has: [{ type: 'host', value: 'www.clean-core.io' }],
        destination: 'https://clean-core.io/:path*',
        permanent: true,
      },
      {
        // F-17: the old Tier-2 knowledge URL was replaced by the A–D classification
        // page. Permanent-redirect so external links and search results keep working.
        source: '/sap-tier-2-extensions',
        destination: '/sap-clean-core-object-classification',
        permanent: true,
      },
      {
        // Public /changelog page retired — release history is kept internal
        // (CHANGELOG.md in the repo). Redirect any old links to the homepage.
        source: '/changelog',
        destination: '/',
        permanent: true,
      },
    ];
  },
  typescript: {
    // F-07: Build errors must block deployment (was: ignoreBuildErrors: true)
    ignoreBuildErrors: false,
  },
  eslint: {
    // F-07: Lint errors must block deployment (was: ignoreDuringBuilds: true)
    ignoreDuringBuilds: false,
  },
  serverExternalPackages: ['esbuild', 'undici'],
  transpilePackages: ['firebase-admin', 'jwks-rsa', 'jose'],
  experimental: {
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  webpack: (config, {dev}) => {
    // DISABLE_HMR=true switches off file watching in `npm run dev`, so a coding
    // agent editing many files does not make the dev server reload on every write.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default analyzer(nextConfig);

