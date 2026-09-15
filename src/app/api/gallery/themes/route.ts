import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const THEME_PAGE_SIZE = 24;

/**
 * GET /api/gallery/themes?q=&limit=&offset=
 * Public, logged-out listing of themes published to the gallery. Uses the anon
 * client so RLS (public select policy) scopes results. `q` filters across theme
 * name/title/description and the author's name/username (case-insensitive).
 * The full theme JSON rides along — it's ~1KB so the gallery page can preview
 * a theme instantly without a second round-trip.
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ items: [], total: 0, error: "Gallery unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || THEME_PAGE_SIZE, 1), 60);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  // `ilike` wildcards from user input are harmless here — they only widen the
  // match, and PostgREST parameterizes the value.
  const like = `%${q}%`;

  const supabase = createClient(url, key);

  let query = supabase
    .from("shared_themes")
    .select(
      "id, name, theme, gallery_title, gallery_description, author_name, author_username, created_at",
      { count: "exact" },
    );
  if (q) {
    query = query.or(
      `name.ilike.${like},gallery_title.ilike.${like},gallery_description.ilike.${like},author_name.ilike.${like},author_username.ilike.${like}`,
    );
  }
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ items: [], total: 0, error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    theme: t.theme,
    title: t.gallery_title ?? "",
    description: t.gallery_description ?? "",
    author_name: t.author_name ?? "",
    author_username: t.author_username ?? "",
    created_at: t.created_at,
  }));
  const total = count ?? 0;
  const hasMore = offset + items.length < total;

  return NextResponse.json({ items, total, hasMore });
}