import { getSupabase } from "@/lib/supabase";

export type ContentPage = {
  slug: string;
  type: "blog" | "docs";
  /** ISO date like "2026-05-12"; docs have none. */
  date?: string;
};

/**
 * Published docs + blog pages from Supabase, used by both sitemaps.
 * Matches the 60s revalidate the docs/blog pages already use so published or
 * unpublished content shows up in search within a minute.
 *
 * ponytail: DB outage => empty list (sitemaps keep their static entries, no
 * crash); upgrade path is merging in an on-disk content cache like the pages.
 */
export async function getPublishedContent(): Promise<ContentPage[]> {
  try {
    const { data, error } = await getSupabase()
      .from("content_pages")
      .select("slug,type,date")
      .in("type", ["docs", "blog"])
      .eq("published", true);
    if (error) return [];
    return (data ?? []).flatMap((p) =>
      p.type === "docs" || p.type === "blog"
        ? [{ slug: String(p.slug), type: p.type, date: p.date ? String(p.date) : undefined }]
        : [],
    );
  } catch {
    return [];
  }
}