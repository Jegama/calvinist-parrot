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
      source: '/:page(reset-password|verify-email)',
      headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }, {
      source: '/admin/analytics',
      headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
    }, {
      source: '/auth/mcp/consent/:path*',
      headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'Referrer-Policy', value: 'same-origin' },
      ],
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
