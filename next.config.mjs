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
        source: '/api/bible/:path*',
        destination: 'https://bible.helloao.org/api/:path*',
      },
    ];
  },
}

export default nextConfig
