import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/fewer/supabaseServer";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";
import { retentionCutoffIso } from "@/lib/fewer/versions";

/** Version-history endpoints gate on a per-plan retention window (0 = none). */
const planLimitResponse = (msg = "Version history requires an account.") =>
  NextResponse.json(
    { error: msg, code: "plan_limit" },
    { status: 403 },
  );

/**
 * GET /api/graphs/[id]/versions/[versionId]
 * Fetch the full snapshot for one version so it can be restored/previewed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;
  const { id, versionId } = await params;

  const limits = limitsFor(await getUserPlan(supabase, user.id));
  if (limits.historyDays === 0) {
    return planLimitResponse();
  }

  const { data, error } = await supabase
    .from("graph_versions")
    .select("id, saved_graph_id, data, node_count, created_at")
    .eq("id", versionId)
    .eq("saved_graph_id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cutoffIso = retentionCutoffIso(limits.historyDays);
  if (data.created_at < cutoffIso) {
    return planLimitResponse("That version is past the plan retention window.");
  }

  return NextResponse.json({ version: data });
}

/**
 * DELETE /api/graphs/[id]/versions/[versionId]
 * Remove a single version (owner only via RLS).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;
  const { id, versionId } = await params;

  const limits = limitsFor(await getUserPlan(supabase, user.id));
  if (limits.historyDays === 0) {
    return planLimitResponse();
  }

  const { error } = await supabase
    .from("graph_versions")
    .delete()
    .eq("id", versionId)
    .eq("saved_graph_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}