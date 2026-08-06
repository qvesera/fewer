import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
  return supabase;
}

export async function GET() {
  const supabase = await getAuthedClient();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("saved_graphs")
    .select("id, name, data, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ graphs: data });
}

export async function POST(request: Request) {
  const supabase = await getAuthedClient();
  if (!supabase) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
    return NextResponse.json({ graph: data });
  }

  const { data, error } = await supabase
    .from("saved_graphs")
    .insert({ name, data: body.data })
    .select("id, name, data, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ graph: data });
}