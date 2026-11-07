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

  // T-239 diagnosis: the CPU profile's hot frames come back minified (`eV @2`),
  // and guessing at them once already produced a wrong verdict (the census
  // blamed the minimap; the A/B exonerated it). A probe build emits browser
  // source maps so hot frames resolve to real file:line — never the shipping
  // build, which stays map-free.
  productionBrowserSourceMaps: process.env.PERF_SOURCEMAPS === "1",

  // Baseline security headers (audit F-5). CSP is deliberately omitted for now:
  // Next's inline scripts make a correct CSP a larger, separate change.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },

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
