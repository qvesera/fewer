import type { MetadataRoute } from "next";

// Interactive app host. Everything indexable here is served under this
// one origin (default NEXT_PUBLIC_APP_URL in production).
const APP =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.fewer.directory").replace(/\/+$/, "") ||
  "https://app.fewer.directory";

export const revalidate = 60;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${APP}/app`,
      priority: 1,
    },
  ];
}