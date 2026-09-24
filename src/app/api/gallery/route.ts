import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GALLERY_PAGE_SIZE = 24;

/**
 * GET /api/gallery?limit=&offset=
 * Public, logged-out listing of graphs the owner has opted into the gallery.
 * Uses the anon client so RLS (public-select policy) scopes results; we filter
 * to in_gallery rows server-side. Only lightweight metadata is returned, never
 * the full graph payload.
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ items: [], total: 0, error: "Gallery unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || GALLERY_PAGE_SIZE, 1), 60);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);
  const category = (searchParams.get("category") ?? "").trim();
  // ponytail: category is validated against a closed allowlist in the query
  const VALID_CATS = new Set(["code","config","image","document","archive","data","media","binary","text"]);
  const catFilter = category && VALID_CATS.has(category) ? category : null;

  const supabase = createClient(url, key);

  let query = supabase
    .from("shared_graphs")
    .select(
      "id, gallery_title, gallery_description, node_count, created_at, author_name, author_username, gallery_category, gallery_categories, gallery_preview",
      { count: "exact" },
    )
    .eq("in_gallery", true)
    .eq("access", "public")
    .is("expires_at", null);

  if (catFilter) query = query.eq("gallery_category", catFilter);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ items: [], total: 0, error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((g) => ({
    id: g.id,
    title: g.gallery_title ?? "Untitled graph",
    description: g.gallery_description ?? "",
    node_count: g.node_count ?? 0,
    created_at: g.created_at,
    author_name: g.author_name ?? "",
    author_username: g.author_username ?? "",
    gallery_category: g.gallery_category ?? null,
    gallery_categories: g.gallery_categories ?? null,
    gallery_preview: g.gallery_preview ?? null,
  }));
  const total = count ?? 0;
  const hasMore = offset + items.length < total;

  return NextResponse.json({ items, total, hasMore });
}