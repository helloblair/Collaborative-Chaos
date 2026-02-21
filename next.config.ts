import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin depends on @opentelemetry/api which can't be bundled by Turbopack.
  // Mark it (and its transitive firebase-admin deps) as external so Node.js loads them directly.
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "@opentelemetry/api"],
};

export default nextConfig;
