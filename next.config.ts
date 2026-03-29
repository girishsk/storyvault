import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve local diagram and image files from data directory
  async rewrites() {
    return [
      {
        source: '/diagrams/:path*',
        destination: '/api/files/diagrams/:path*',
      },
      {
        source: '/images/:path*',
        destination: '/api/files/images/:path*',
      },
    ];
  },
};

export default nextConfig;
