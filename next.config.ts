import type { NextConfig } from "next";
import { version } from "./package.json";

// Netlify automatically provides COMMIT_REF during builds
const commitHash = process.env.COMMIT_REF
  ? process.env.COMMIT_REF.substring(0, 7)
  : "dev";

// Combines package.json version with the git commit SHA (e.g., "0.3.0-a1b2c3d")
const appVersion = `${version}-${commitHash}`;

const nextConfig: NextConfig = {
  output: process.env.NETLIFY ? undefined : "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Inject the version into NEXT_PUBLIC_APP_VERSION at build time
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;