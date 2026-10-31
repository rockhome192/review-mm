import type { NextConfig } from "next";

// The site is fully static: every page is built from Supabase at build time
// and redeployed after the pipeline updates data, so visitors never hit the DB.
// Locally the Supabase vars live in the repo-root .env.local; CI sets them directly.
try {
  process.loadEnvFile("../.env.local");
} catch {}

// Security headers on every page. The CSP only covers framing, plugins, <base> and
// form targets: scripts stay unrestricted because Next inlines its own and the page
// talks to Supabase (votes) and Cloudflare Web Analytics.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
