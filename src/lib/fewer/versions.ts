// Version-history helpers. `recordVersion` is the single place that writes a
// snapshot for a saved graph — called from the save flow (/api/graphs POST)
// and the explicit version endpoint. It dedupes identical consecutive saves
// and prunes to a bounded window so history doesn't grow unbounded.
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_VERSIONS_PER_GRAPH = 50;

export interface GraphVersionMeta {
  id: string;
  saved_graph_id: string;
  node_count: number;
  created_at: string;
}

/**
 * Record a new version for a saved graph. Skips when the latest recorded
 * snapshot is byte-identical (re-saving without changes shouldn't spam
 * history), then prunes to the newest {@link MAX_VERSIONS_PER_GRAPH}.
 */
export async function recordVersion(
  supabase: SupabaseClient,
  user_id: string,
  saved_graph_id: string,
  data: unknown,
): Promise<{ recorded: boolean; error?: string }> {
  const nodeCount = typeof data === "object" && data !== null
    && Array.isArray((data as { nodes?: unknown[] }).nodes)
    ? (data as { nodes: unknown[] }).nodes.length
    : 0;

  // Dedup: if the latest recorded version matches, skip.
  const { data: latest } = await supabase
    .from("graph_versions")
    .select("data")
    .eq("saved_graph_id", saved_graph_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest && JSON.stringify(latest.data) === JSON.stringify(data)) {
    return { recorded: false };
  }

  const { error } = await supabase.from("graph_versions").insert({
    saved_graph_id,
    user_id,
    data,
    node_count: nodeCount,
  });
  if (error) return { recorded: false, error: error.message };

  // Prune to the newest window (ponytail: single bounded DELETE, no trigger).
  // RLS scopes reads to this owner.
  const { data: all } = await supabase
    .from("graph_versions")
    .select("id")
    .eq("saved_graph_id", saved_graph_id)
    .order("created_at", { ascending: false });
  const overflow = (all ?? []).slice(MAX_VERSIONS_PER_GRAPH);
  if (overflow.length > 0) {
    const ids = overflow.map((v) => v.id);
    await supabase.from("graph_versions").delete().in("id", ids);
  }

  return { recorded: true };
}