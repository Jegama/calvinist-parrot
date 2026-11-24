/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cultofthepartyparrot.com',
        port: '',
        pathname: '/parrots/**',
      },
    ],
  },
  async headers() {
    return [{
      source: '/admin/analytics',
      headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
    }];
  },
  async rewrites() {
    return [
      {
        source: '/api/bible/:path*',
        destination: 'https://bible.helloao.org/api/:path*',
      },
    ];
  },
  outputFileTracingIncludes: {
    '/': ['./node_modules/.prisma/client/**/*'],
    '/api/**': ['./node_modules/.prisma/client/**/*'],
  },
}

export default nextConfig
