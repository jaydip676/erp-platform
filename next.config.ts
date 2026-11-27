import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ngrok (and similar tunnels) are a different host than localhost.
  // Without this, Next.js blocks /_next assets and the login page cannot run.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.ngrok.dev",
  ],
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
