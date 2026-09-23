/**
 * Client-side tier vocabulary and feature access control.
 *
 * `Tier` represents who the visitor is. `MIN_TIER` maps each client-visible
 * feature to the minimum tier that unlocks it. `can()` answers the gate check.
 *
 * Server-side enforcement lives in `plans.ts` (PlanLimits, getUserPlan,
 * overLimit). Client checks are cosmetic — they hide UI, never deny API calls.
 *
 * ## Tier derivation
 *   - `guest`:  signed out
 *   - `free`:   signed in, plan === "free"
 *   - `pro`:    signed in, plan === "pro" || plan === "team"
 *
 * Fail-safe: missing plan / unknown plan → free; no user → guest.
 */

// ── Tiers ─

export type Tier = "guest" | "free" | "pro";

const RANK: Record<Tier, number> = { guest: 0, free: 1, pro: 2 };

/**
 * Auth + profile → one tier. Fail-safe: no user → guest, unknown/missing
 * plan → free (mirrors `limitsFor` in plans.ts).
 */
export function tierOf(
  user: { id?: string } | null | undefined,
  plan?: string | null,
): Tier {
  if (!user) return "guest";
  return plan === "pro" || plan === "team" ? "pro" : "free";
}

// ── Features & minimum tier ─

export type Feature =
  // ── Pro workspace ──
  | "panelWorkspace"  // docking, split views, corner grips
  | "tags"            // tag panel, tag menus, tag filter, tag ring (inert data stays)
  // ── Saved graphs & sharing ──
  | "savedGraphs"     // sidebar "Your Directories", save/load/rename/delete
  | "galleryPublish"  // publish to the theme gallery
  | "largeShareLinks" // DB-backed short share links for large payloads
  | "versionHistory"  // per-graph version snapshots
  // ── Cloud connectors ──
  | "watchIndexes"    // watched public file indexes
  | "cloudImport"     // OneDrive / GitHub / Google Drive import origins
  // ── Power-user tools (free tier gets these) ──
  | "edgeMotion"           // animated edges, dash clock
  | "advancedImportFormats" // JSON / script import formats
  | "unbrandedExport"      // export without the fewer watermark
  | "customTheme"          // custom theme mode in Settings
  | "nodeMetrics"          // card width/height sliders
  | "canvasAddChild"       // right-click → Add Child Node
  | "batchActions"         // batch rename, batch tag, batch move
  | "layoutOrientation"    // left-to-right / bottom-to-top layouts
  | "historyTools"         // undo/redo toolbar block
  | "graphAnalytics"       // graph statistics panel
  // ── Cloud-saved custom themes ──
  | "savedThemes";

/** Minimum tier that unlocks each client feature. */
export const MIN_TIER: Record<Feature, Tier> = {
  panelWorkspace: "pro",
  tags: "pro",
  largeShareLinks: "pro",
  savedThemes: "pro",

  // Everything else: any signed-in account.
  savedGraphs: "free",
  galleryPublish: "free",
  versionHistory: "free",
  watchIndexes: "free",
  cloudImport: "free",
  edgeMotion: "free",
  advancedImportFormats: "free",
  unbrandedExport: "free",
  customTheme: "free",
  nodeMetrics: "free",
  canvasAddChild: "free",
  batchActions: "free",
  layoutOrientation: "free",
  historyTools: "free",
  graphAnalytics: "free",
};

/** True when the given tier meets or exceeds the feature's minimum. */
export function can(feature: Feature, tier: Tier): boolean {
  return RANK[tier] >= RANK[MIN_TIER[feature]];
}
