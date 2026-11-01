import type { NextConfig } from "next";

// Cache Components is intentionally off: every page here reads the session cookie
// and the database, so the classic dynamic rendering model is the simpler fit.
const nextConfig: NextConfig = {
  // File uploads go through server actions. Files are limited to 4 MB in the app (Vercel's own request limit is 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
