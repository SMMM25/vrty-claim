import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint locally via `npm run lint`; keep production builds unblocked.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
