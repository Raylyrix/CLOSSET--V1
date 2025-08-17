/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@closset/engine',
    '@closset/jeeliz-integration',
    '@closset/shared'
  ],
  async rewrites() {
    return [
      { source: '/krita/:path*', destination: 'http://localhost:3001/krita/:path*' },
      { source: '/models/:path*', destination: 'http://localhost:3001/models/:path*' }
    ];
  },
  webpack(config, { dev }) {
    // Reduce memory pressure from Webpack filesystem cache compression (gzip)
    if (config.cache && config.cache.type === 'filesystem') {
      config.cache.compression = false; // disable gzip/brotli compression of cache packs
      // Lower memory generations to keep in RAM
      config.cache.maxMemoryGenerations = 1;
    }
    // Keep devtool light in dev to avoid large source maps
    if (dev) {
      config.devtool = 'eval-cheap-module-source-map';
    }
    return config;
  },
};

export default nextConfig;
