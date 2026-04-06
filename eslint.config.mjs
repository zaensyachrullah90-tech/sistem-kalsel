/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Memerintahkan Vercel untuk mengabaikan peringatan saat proses build
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;