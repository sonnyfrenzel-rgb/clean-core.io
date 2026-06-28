import withBundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
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
  // Proxy Firebase Auth handler through custom domain to avoid third-party cookie blocking.
  // This allows authDomain to be set to 'clean-core.io' instead of 'cleancore-491216.firebaseapp.com',
  // keeping the auth iframe/popup on the same origin as the app.
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://cleancore-491216.firebaseapp.com/__/auth/:path*',
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
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
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

