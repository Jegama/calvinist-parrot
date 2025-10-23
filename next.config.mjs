import path from 'path'

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
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@tanstack/react-query': path.join(process.cwd(), 'lib/vendor/tanstack-react-query'),
      zustand: path.join(process.cwd(), 'lib/vendor/zustand'),
    }
    return config
  },
}

export default nextConfig
