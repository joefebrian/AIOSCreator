import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.18.36",
    "127.0.0.1",
    "localhost",
    "100.77.69.45",
    "aioscreator.tailc20c39.ts.net",
    "*.tailc20c39.ts.net",
  ],
  experimental: {
    serverActions: { bodySizeLimit: "128mb" },
  },
  async redirects() {
    return [
      { source: "/content", destination: "/create/ugc-factory", permanent: false },
      { source: "/research", destination: "/intelligence/research", permanent: false },
      { source: "/production", destination: "/create/motion", permanent: false },
      { source: "/distribute", destination: "/distribute/calendar", permanent: false },
      { source: "/grow", destination: "/grow/engine", permanent: false },
      { source: "/system", destination: "/system/settings", permanent: false },
    ];
  },
};

export default nextConfig;
