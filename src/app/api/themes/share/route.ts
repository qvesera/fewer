import { NextResponse } from "next/server";
import { getSupabaseCookieClient } from "@/lib/fewer/supabaseServer";
import { isDangerousText } from "@/lib/fewer/textValidation";

/**
 * Publish / unpublish a user's saved theme to the community gallery.
 *
 * POST { id: saved-theme-id, title?, description? } — creates or refreshes the
 * gallery row for that saved theme (one row per saved theme; idempotent via
 * saved_theme_id unique). Requires a completed profile (first name + username)
 * so gallery entries are attributable — same gate as the graph gallery.
 *
 * DELETE ?saved_theme_id=<id> — removes the theme from the gallery (keeps the
 * saved theme itself).
 *
 * GET — lists the caller's published themes (share status for the theme editor).
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseCookieClient();
  if (!supabase) return NextResponse.json({ error: "Gallery unavailable" }, { status: 503 });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const userId = authData.user.id;

  let body: { id?: unknown; title?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "Saved theme id is required" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim() && !isDangerousText(body.title)
      ? body.title.trim().slice(0, 200)
      : null;
  const description =
    typeof body.description === "string" && body.description.trim() && !isDangerousText(body.description)
      ? body.description.trim().slice(0, 500)
      : null;
  if (body.title != null && typeof body.title === "string" && isDangerousText(body.title)) {
    return NextResponse.json({ error: "Invalid gallery title" }, { status: 400 });
  }
  if (body.description != null && typeof body.description === "string" && isDangerousText(body.description)) {
    return NextResponse.json({ error: "Invalid gallery description" }, { status: 400 });
  }

  // The theme must exist and be owned (RLS). Also pulls a fresh copy of the
  // theme at publish time so the gallery never serves stale colors.
  const { data: saved, error: savedErr } = await supabase
    .from("saved_themes")
    .select("id, name, theme")
    .eq("id", body.id)
    .maybeSingle();
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Saved theme not found" }, { status: 404 });

  // Gallery entries are attributed to the author — first name + username are
  // required before publishing (mirrors the graph gallery's profile gate).
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, username")
    .eq("user_id", userId)
    .maybeSingle();
  const authorName = profile?.first_name?.trim() ?? "";
  const authorUsername = profile?.username?.trim() ?? "";
  if (!authorName || !authorUsername) {
    return NextResponse.json(
      { error: "Add your first name and a username to publish a theme to the gallery.", code: "profile_required" },
      { status: 400 },
    );
  }

  const { data: share, error } = await supabase
    .from("shared_themes")
    .upsert(
      {
        user_id: userId,
        saved_theme_id: saved.id,
        name: saved.name,
        theme: saved.theme,
        gallery_title: title,
        gallery_description: description,
        author_name: authorName,
        author_username: authorUsername,
      },
      { onConflict: "saved_theme_id" },
    )
    .select("id, saved_theme_id, name, theme, gallery_title, gallery_description, author_name, author_username, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ share });
}

export async function DELETE(request: Request) {
  const supabase = await getSupabaseCookieClient();
  if (!supabase) return NextResponse.json({ error: "Gallery unavailable" }, { status: 503 });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const savedThemeId = new URL(request.url).searchParams.get("saved_theme_id");
  if (!savedThemeId) {
    return NextResponse.json({ error: "saved_theme_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("shared_themes")
    .delete()
    .eq("saved_theme_id", savedThemeId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await getSupabaseCookieClient();
  if (!supabase) return NextResponse.json({ error: "Gallery unavailable" }, { status: 503 });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("shared_themes")
    .select("id, saved_theme_id, name, gallery_title, gallery_description")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shares: data ?? [] });
}