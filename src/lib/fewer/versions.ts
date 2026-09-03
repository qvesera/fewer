// Version-history helpers. `recordVersion` is the single place that writes a
// snapshot for a saved graph — called from the save flow (/api/graphs POST)
// and the explicit version endpoint. It dedupes identical consecutive saves
// and prunes to a bounded window so history doesn't grow unbounded.
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_VERSIONS_PER_GRAPH = 50;

export const DAY_MS = 86_400_000;

/** ISO timestamp `days` before now — the plan retention cutoff. */
export function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * Order-independent deep equality for graph snapshots. Compares object keys by
 * name (not insertion order) and arrays index-wise. Needed because the server
 * stores `data` as Postgres `jsonb`, which does not preserve object key order,
 * so `JSON.stringify` comparisons would mismatch identical snapshots.
 */
export function graphDataEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    if (a.length !== arrB.length) return false;
    return a.every((item, i) => graphDataEqual(item, arrB[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const aKeys = Object.keys(objA);
  if (aKeys.length !== Object.keys(objB).length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
    if (!graphDataEqual(objA[k], objB[k])) return false;
  }
  return true;
}

export interface GraphVersionMeta {
  id: string;
  saved_graph_id: string;
  node_count: number;
  created_at: string;
}

/**
 * Record a new version for a saved graph. Skips when the latest recorded
 * snapshot is byte-identical (re-saving without changes shouldn't spam
 * history), then prunes: at most {@link MAX_VERSIONS_PER_GRAPH} snapshots
 * per graph, and nothing older than the plan's `retentionDays` window
 * (free = 30, pro/team = 365 — see plans.ts).
 */
export async function recordVersion(
  supabase: SupabaseClient,
  user_id: string,
  saved_graph_id: string,
  data: unknown,
  retentionDays: number,
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

  if (latest && graphDataEqual(latest.data, data)) {
    return { recorded: false };
  }

  const { error } = await supabase.from("graph_versions").insert({
    saved_graph_id,
    user_id,
    data,
    node_count: nodeCount,
  });
  if (error) return { recorded: false, error: error.message };

  // Prune in one pass (ponytail: single bounded DELETE set, no trigger):
  // drop anything older than the retention window and keep at most
  // MAX_VERSIONS_PER_GRAPH. RLS scopes reads to this owner.
  const cutoffIso = retentionCutoffIso(retentionDays);
  const { data: all } = await supabase
    .from("graph_versions")
    .select("id, created_at")
    .eq("saved_graph_id", saved_graph_id)
    .order("created_at", { ascending: false });
  const stale = (all ?? []).filter(
    (v, i) => v.created_at < cutoffIso || i >= MAX_VERSIONS_PER_GRAPH,
  );
  if (stale.length > 0) {
    const ids = stale.map((v) => v.id);
    await supabase.from("graph_versions").delete().in("id", ids);
  }

  return { recorded: true };
}