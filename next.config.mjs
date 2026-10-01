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

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Do not leak the framework via the X-Powered-By header (ZAP 10037).
  poweredByHeader: false,
  htmlLimitedBots,
  async headers() {
    return [
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

