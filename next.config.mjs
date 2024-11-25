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
  async rewrites() {
    return [
      {
        source: '/api/c/:path*',
        destination: 'https://bible.helloao.org/api/c/:path*',
      },
      {
        source: '/api/:translation/:path*',
        destination: 'https://bible.helloao.org/api/:translation/:path*',
      },
    ];
  },
}

export default nextConfig