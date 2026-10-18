import type { NextConfig } from "next";

// The site is fully static: every page is built from Supabase at build time
// and redeployed after the pipeline updates data, so visitors never hit the DB.
// Locally the Supabase vars live in the repo-root .env.local; CI sets them directly.
try {
  process.loadEnvFile("../.env.local");
} catch {}

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  turbopack: {
    root: process.cwd(), // web/ has its own lockfile; the repo root holds the pipeline
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
