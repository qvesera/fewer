import type { NextConfig } from "next";
import { version } from "./package.json";
import createMDX from "@next/mdx";

// Netlify automatically provides COMMIT_REF during builds
const commitHash = process.env.COMMIT_REF
  ? process.env.COMMIT_REF.substring(0, 7)
  : "dev";

// Combines package.json version with the git commit SHA (e.g., "0.2.5-a1b2c3d")
const appVersion = `${version}-${commitHash}`;

const nextConfig: NextConfig = {
  output: process.env.NETLIFY ? undefined : "standalone",
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Inject the version into NEXT_PUBLIC_APP_VERSION at build time
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  
  // Disable Netlify Deploy Preview overlays in production
  // This removes CDP, Bugsnag, and analytics scripts from production builds
  ...(process.env.NETLIFY &&
    process.env.CONTEXT === "production" && {
      netlify: {
        cdpHidden: true,
      },
    }),
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
