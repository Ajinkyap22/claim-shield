import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(process.env.DOCKER_BUILD
    ? {}
    : { outputFileTracingRoot: path.join(__dirname, "../..") }),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.INTERNAL_API_URL || "http://gateway:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
