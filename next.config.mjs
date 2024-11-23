/** @type {import('next').NextConfig} */
// const nextConfig = {};
// 
// export default nextConfig;
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
  }
  
  export default nextConfig
  