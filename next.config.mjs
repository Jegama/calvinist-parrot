/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/(api|trpc)/(.*)': [
      './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
      './node_modules/.prisma/client/libquery_engine-linux-musl.so.node',
    ],
  },
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
  async rewrites() {
    return [
      {
        source: '/api/bible/:path*',
        destination: 'https://bible.helloao.org/api/:path*',
      },
    ];
  },
}

export default nextConfig
