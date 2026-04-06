/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Mengabaikan error aturan penulisan
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Mengabaikan error aturan tipe data TypeScript (INI KUNCINYA!)
    ignoreBuildErrors: true,
  },
};

export default nextConfig;