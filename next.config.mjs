/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  typescript: {
    // F-07: Build errors must block deployment (was: ignoreBuildErrors: true)
    ignoreBuildErrors: false,
  },
  eslint: {
    // F-07: Lint errors must block deployment (was: ignoreDuringBuilds: true)
    ignoreDuringBuilds: false,
  },
  serverExternalPackages: ['firebase-admin', 'esbuild', 'undici'],
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

export default nextConfig;
