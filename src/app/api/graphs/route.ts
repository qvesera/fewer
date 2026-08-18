import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordVersion } from "@/lib/fewer/versions";

/**
 * Authed CRUD for saved graphs. Uses the user's session cookie so RLS
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
  const { supabase, user } = authed;

  const { data, error } = await supabase
    .from("saved_graphs")
    .select("id, name, data, created_at, updated_at, is_favorite")
    .order("is_favorite", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach each graph's active share (access mode) so the UI can show a badge.
  const { data: shares } = await supabase
    .from("shared_graphs")
    .select("saved_graph_id, access")
    .eq("owner_id", user.id)
    .not("saved_graph_id", "is", null);
  const shareMap = new Map<string, { access: string }>();
  for (const s of shares ?? []) {
    if (s.saved_graph_id) shareMap.set(s.saved_graph_id, { access: s.access });
  }

  const graphs = (data ?? []).map((g) => ({ ...g, share: shareMap.get(g.id) ?? null }));
  return NextResponse.json({ graphs });
}

export async function POST(request: Request) {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;

  let body: { name?: string; data?: unknown; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "Untitled").toString().slice(0, 200);
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "Missing graph data" }, { status: 400 });
  }

  if (body.id) {
    // Upsert: update existing saved graph (owner-only via RLS).
    const { data, error } = await supabase
      .from("saved_graphs")
      .update({ name, data: body.data })
      .eq("id", body.id)
      .select("id, name, data, created_at, updated_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Best-effort history snapshot; never blocks the save on failure.
    await recordVersion(supabase, user.id, data.id, body.data);
    return NextResponse.json({ graph: data });
  }

  const { data, error } = await supabase
    .from("saved_graphs")
    .insert({ name, data: body.data, user_id: user.id })
    .select("id, name, data, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Best-effort history snapshot; never blocks the save on failure.
  await recordVersion(supabase, user.id, data.id, body.data);
  return NextResponse.json({ graph: data });
}