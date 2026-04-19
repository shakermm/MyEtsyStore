/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images-api.printify.com' },
      { protocol: 'https', hostname: 'images.printify.com' },
      { protocol: 'https', hostname: '*.printify.com' },
    ],
  },
};

export default nextConfig;
