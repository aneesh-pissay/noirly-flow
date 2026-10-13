import type { NextConfig } from "next";

for (const name of Object.keys(process.env)) {
  if (/^NEXT_PUBLIC_.*(?:SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN|API_KEY)$/i.test(name)) {
    throw new Error(`Secret-like configuration must not be exposed to browsers: ${name}`);
  }
}

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // End-to-end tests build into their own folder (see playwright.config.ts),
  // so they never clobber a dev server's or a real build's `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    // The proxy buffers request bodies up to this size and silently truncates
    // past it; task attachments are capped at 25 MB (server/attachments).
    proxyClientMaxBodySize: "26mb",
  },
  transpilePackages: [
    "@noirly-dev/realtime-client",
    "@noirly-dev/realtime-shared",
    "@noirly-dev/ui",
  ],
};

export default nextConfig;
