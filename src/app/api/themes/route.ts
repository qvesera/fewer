import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isDangerousText } from "@/lib/fewer/textValidation";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";

/**
 * Authed CRUD for a user's saved custom themes. Uses the session cookie so RLS
 * (owner-only) is enforced server-side. Returns 401 when not signed in.
 */
async function getAuthedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* ignore */
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { supabase, user: data.user };
}

export async function GET() {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase } = authed;

  const { data, error } = await supabase
    .from("saved_themes")
    .select("id, name, theme, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ themes: data ?? [] });
}

export async function POST(request: Request) {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;

  // Saved (cloud-synced) themes are a Pro feature (per-theme storage).
  const limits = limitsFor(await getUserPlan(supabase, user.id));
  if (limits.savedThemes === false) {
    return NextResponse.json(
      { error: "Saved themes are a Pro feature. See /docs/plans.", code: "plan_limit" },
      { status: 403 },
    );
  }
  let body: { name?: string; theme?: unknown; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.name != null && (typeof body.name !== "string" || isDangerousText(body.name))) {
    return NextResponse.json({ error: "Invalid theme name" }, { status: 400 });
  }
  const name = (body.name ?? "").toString().trim().slice(0, 200);
  if (!name) {
    return NextResponse.json({ error: "Theme name is required" }, { status: 400 });
  }
  if (!body.theme || typeof body.theme !== "object") {
    return NextResponse.json({ error: "Missing theme data" }, { status: 400 });
  }

  if (body.id) {
    // Upsert: update an existing saved theme (owner-only via RLS).
    const { data, error } = await supabase
      .from("saved_themes")
      .update({ name, theme: body.theme })
      .eq("id", body.id)
      .select("id, name, theme, created_at, updated_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ theme: data });
  }

  const { data, error } = await supabase
    .from("saved_themes")
    .insert({ name, theme: body.theme, user_id: user.id })
    .select("id, name, theme, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ theme: data });
}
