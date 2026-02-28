import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(process.env.DOCKER_BUILD
    ? {}
    : { outputFileTracingRoot: path.join(__dirname, "../..") }),
};

export default nextConfig;
