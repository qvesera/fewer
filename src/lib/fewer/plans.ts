// Server-side plan entitlements. The plan lives on profiles.plan (service-role
// only — see migration 0022) and every metered API route checks it here.
// Client-side checks would be cosmetic: the API routes are the enforcement.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro";

export interface PlanLimits {
  /** Max saved graphs (Infinity = unlimited). */
  savedGraphs: number;
  /** Max watched indexes (Infinity = unlimited). */
  watchedIndexes: number;
  /** Cloud storage connectors (OAuth account linking). */
  cloudConnections: boolean;
  /** Invite-only share links (public links stay free). */
  inviteSharing: boolean;
}

export const FREE_LIMITS: PlanLimits = {
  savedGraphs: 5,
  watchedIndexes: 3,
  cloudConnections: false,
  inviteSharing: false,
};

export const PRO_LIMITS: PlanLimits = {
  savedGraphs: Infinity,
  watchedIndexes: Infinity,
  cloudConnections: true,
  inviteSharing: true,
};

export function limitsFor(plan: Plan | null | undefined): PlanLimits {
  return plan === "pro" ? PRO_LIMITS : FREE_LIMITS;
}

/** Read the user's plan. Missing row / read error → free (fail-safe). */
export async function getUserPlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.plan === "pro" ? "pro" : "free";
}

/**
 * Count rows the user owns. Returns -1 on error.
 * (ponytail: fail-open — a counting outage shouldn't brick saves; RLS still
 * scopes every row, so the worst case is an extra row past the cap.)
 */
export async function countOwned(
  supabase: SupabaseClient,
  table: "saved_graphs" | "watched_indexes",
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || count === null) return -1;
  return count;
}

/** True when a successful count has reached the plan's cap (-1 = error → allow). */
export function overLimit(count: number, limit: number): boolean {
  return count >= 0 && count >= limit;
}
