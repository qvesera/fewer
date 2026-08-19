import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordVersion } from "@/lib/fewer/versions";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";

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

/**
 * GET /api/graphs/[id]/versions
 * List version metadata for a saved graph (owner only). Full `data` payloads
 * are excluded here — they can be large, and the list is just a picker.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;
  const { id } = await params;

  // Version history is a Pro feature (per-save storage cost).
  if (!limitsFor(await getUserPlan(supabase, user.id)).versionHistory) {
    return NextResponse.json(
      { error: "Version history is a Pro feature. Upgrade to restore past versions.", code: "plan_limit" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("graph_versions")
    .select("id, saved_graph_id, node_count, created_at")
    .eq("saved_graph_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ versions: data ?? [] });
}

/**
 * POST /api/graphs/[id]/versions
 * Record an explicit snapshot as a new version (deduped + pruned).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;
  const { id } = await params;

  let body: { data?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "Missing graph data" }, { status: 400 });
  }

  // Version history is a Pro feature (per-save storage cost).
  if (!limitsFor(await getUserPlan(supabase, user.id)).versionHistory) {
    return NextResponse.json(
      { error: "Version history is a Pro feature. Upgrade to keep snapshots of every save.", code: "plan_limit" },
      { status: 403 },
    );
  }

  const result = await recordVersion(supabase, user.id, id, body.data);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ recorded: result.recorded });
}