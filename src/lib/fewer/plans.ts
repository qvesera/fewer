// Server-side plan entitlements. The plan lives on profiles.plan (service-role
// only — see migrations 0022/0023) and every metered API route checks it here.
// Client-side checks would be cosmetic: the API routes are the enforcement.
// Plans are assigned by the operator directly in the database (profiles.plan);
// self-serve Stripe checkout exists but sits behind the BILLING_ENABLED flag.
// "guest" is not a stored plan — it means signed out. Guests keep everything
// local: local import, all exports (watermarked), hash sharing under 2,000
// characters. Their limits live client-side; the server never had a session
// to check anyway.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "team";

export interface PlanLimits {
  /** Max saved graphs (Infinity = unlimited). */
  savedGraphs: number;
  /** Max watched indexes (Infinity = unlimited). */
  watchedIndexes: number;
  /** Version-history retention window in days (0 = no history). */
  historyDays: number;
  /** Cloud-saved custom themes (Pro+). */
  savedThemes: boolean;
  /** DB-backed short share links for large payloads (Pro+). */
  largeShareLinks: boolean;
  /** Cloud storage connectors (OAuth account linking). */
  cloudConnections: boolean;
  /** Invite-only share links (public links stay free). */
  inviteSharing: boolean;
}

/** Signed-out guests. Enforced client-side + by auth (no session → no server features). */
export const GUEST_LIMITS: PlanLimits = {
  savedGraphs: 0,
  watchedIndexes: 0,
  historyDays: 0,
  savedThemes: false,
  largeShareLinks: false,
  cloudConnections: false,
  inviteSharing: false,
};

export const FREE_LIMITS: PlanLimits = {
  savedGraphs: 3,
  watchedIndexes: 3,
  historyDays: 30,
  savedThemes: false,
  largeShareLinks: false,
  cloudConnections: false,
  inviteSharing: false,
};

export const PRO_LIMITS: PlanLimits = {
  savedGraphs: Infinity,
  // ponytail: 10 not Infinity — watch crawls have per-index marginal cost
  // (GH Actions minutes + digest email). Team raises this later.
  watchedIndexes: 10,
  historyDays: 365,
  savedThemes: true,
  largeShareLinks: true,
  cloudConnections: true,
  inviteSharing: true,
};

// Team shares pro limits for now; org workspaces, shared theme libraries and
// admin controls are planned — see /docs/plans.
export const TEAM_LIMITS: PlanLimits = PRO_LIMITS;

export function limitsFor(plan: Plan | null | undefined): PlanLimits {
  // Fail-safe: anything unrecognized → free (the enum makes this unreachable
  // from the DB, but keeps the default restrictive).
  if (plan === "pro") return PRO_LIMITS;
  if (plan === "team") return TEAM_LIMITS;
  return FREE_LIMITS;
}

/** Read the user's plan. Missing row / read error → free (fail-safe). */
export async function getUserPlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await supabase
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.plan === "pro" || data?.plan === "team" ? data.plan : "free";
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
