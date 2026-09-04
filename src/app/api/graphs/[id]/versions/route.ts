import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordVersion, retentionCutoffIso } from "@/lib/fewer/versions";
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

  // Version history is metered: per-plan retention window (0 = none).
  const limits = limitsFor(await getUserPlan(supabase, user.id));
  if (limits.historyDays === 0) {
    return NextResponse.json(
      { error: "Version history requires an account.", code: "plan_limit" },
      { status: 403 },
    );
  }
  const cutoffIso = retentionCutoffIso(limits.historyDays);
  const { data, error } = await supabase
    .from("graph_versions")
    .select("id, saved_graph_id, node_count, created_at")
    .eq("saved_graph_id", id)
    .gte("created_at", cutoffIso)
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

  const limits = limitsFor(await getUserPlan(supabase, user.id));
  if (limits.historyDays === 0) {
    return NextResponse.json(
      { error: "Version history requires an account.", code: "plan_limit" },
      { status: 403 },
    );
  }
  const result = await recordVersion(supabase, user.id, id, body.data, limits.historyDays);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ recorded: result.recorded });
}
