import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "framer-motion"],
  },
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/products", destination: "/portfolio/analytics", permanent: true },
      { source: "/details", destination: "/probability", permanent: true },
      { source: "/primary-details", destination: "/probability", permanent: true },
      { source: "/portfolio/details", destination: "/probability", permanent: true },
      { source: "/primary-output", destination: "/initial-probability", permanent: true },
      { source: "/valuation", destination: "/initial-probability", permanent: true },
      { source: "/payoff", destination: "/current-probability", permanent: true },
      { source: "/reference", destination: "/intelligence", permanent: true },
      { source: "/category/:cat/valuation", destination: "/initial-probability", permanent: true },
      { source: "/category/:cat/payoff", destination: "/current-probability", permanent: true },
      { source: "/category/:cat", destination: "/desk", permanent: true },
    ];
  },
};

export default nextConfig;
