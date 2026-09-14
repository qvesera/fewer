import type { MetadataRoute } from "next";
import { getPublishedContent } from "./sitemap-content";

// Marketing/public site. GitHub Pages / fewer.directory. The app lives on the
// separate app.fewer.directory host (see src/app/app/sitemap.ts), so keep this
// file to one host — Google treats a sitemap file as belonging to one host.
const HOME =
  (process.env.NEXT_PUBLIC_HOME_URL ?? "https://fewer.directory").replace(/\/+$/, "") ||
  "https://fewer.directory";

export const revalidate = 60;

const STATIC: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1 },
  { path: "/welcome", priority: 0.8 },
  { path: "/gallery", priority: 0.7 },
  { path: "/docs", priority: 0.6 },
  { path: "/blog", priority: 0.6 },
  { path: "/privacy", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC.map(({ path, priority }) => ({
    url: `${HOME}${path}`,
    priority,
  }));

  for (const page of await getPublishedContent()) {
    entries.push({
      url: `${HOME}/${page.type === "blog" ? "blog" : "docs"}/${page.slug}`,
      ...(page.date ? { lastModified: page.date } : {}),
      priority: page.type === "blog" ? 0.6 : 0.5,
    });
  }

  return entries;
}