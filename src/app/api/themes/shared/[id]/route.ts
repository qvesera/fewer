import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/themes/shared/[id]
 * Public fetch of one published theme — backs the `#t:<id>` deep link that the
 * app uses to apply a gallery theme immediately on load. Scoped by the public
 * select RLS; banner rows that were unpublished/deleted return 404.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Gallery unavailable" }, { status: 503 });

  const { id } = await params;
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("shared_themes")
    .select("id, name, theme, gallery_title, gallery_description, author_name, author_username, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ theme: data });
}