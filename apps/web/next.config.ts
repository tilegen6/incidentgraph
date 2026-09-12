import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@incidentgraph/shared'],
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4100'}/api/:path*`,
      },
    ];
  },
};
export default config;
