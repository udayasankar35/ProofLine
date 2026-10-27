import type { NextConfig } from "next";

// Cache Components is intentionally off: every page here reads the session cookie
// and the database, so the classic dynamic rendering model is the simpler fit.
const nextConfig: NextConfig = {
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
