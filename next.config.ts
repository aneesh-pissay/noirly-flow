import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests build into their own folder (see playwright.config.ts),
  // so they never clobber a dev server's or a real build's `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  transpilePackages: [
    "@noirly-dev/realtime-client",
    "@noirly-dev/realtime-shared",
    "@noirly-dev/ui",
  ],
};

export default nextConfig;
