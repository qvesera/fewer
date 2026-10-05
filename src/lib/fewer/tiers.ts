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

import { isHost } from "./nativeShell";

/** True inside any desktop shell host; false on web, SSR, and bun tests. */
const inHostShell = isHost();

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
  // ── Desktop offline (license-gated; T-090) ──
  // nativeBrowse is reserved: folder import itself is CORE in the shell
  // (the webview fallback picker is broken in WebKitGTK — see
  // importActionFolder.ts), so no UI checks this flag today.
  | "localLibrary"     // save/load graphs in the on-disk Fewer Library
  | "nativeBrowse"     // reserved: future pro-tier native browsing extras
  | "localPreview"     // in-app image/PDF/text preview of local files
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
  largeShareLinks: "pro",  // server: SHARE_FREE_MAX_CHARS threshold + planLimits.largeShareLinks
  savedThemes: "pro",
  // Desktop offline: gated behind a desktop pro license (license gate, T-090).
  localLibrary: "pro",
  nativeBrowse: "pro",
  localPreview: "pro",

  // Everything else: any signed-in account.
  savedGraphs: "free",
  galleryPublish: "free",
  versionHistory: "free",  // server: 30-day retention for Free, 365-day for Pro; GUEST = 0
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
  return canFor(inHostShell, feature, tier);
}

// ── Standalone overrides (T-100) ────────────────────────────────────────
// The shell's tier is license-based and never "guest" (FewerApp derives
// "free" without a license, "pro" with one): "free" = the core offline app,
// "pro" = a valid desktop license. Overrides adjust features whose web tier
// doesn't fit the standalone split; everything else keeps MIN_TIER, which in
// the shell reads as "available without a license".
export const SHELL_MIN_TIER: Partial<Record<Feature, Tier>> = {
  // Free standalone exports carry the watermark; removing it is a license feature.
  unbrandedExport: "pro",
};

/** Pure core: the effective minimum tier for a feature. */
export function minTierFor(inShell: boolean, feature: Feature): Tier {
  return (inShell ? SHELL_MIN_TIER[feature] : undefined) ?? MIN_TIER[feature];
}

/** Pure core of `can` — unit-testable for both hosts. */
export function canFor(inShell: boolean, feature: Feature, tier: Tier): boolean {
  return RANK[tier] >= RANK[minTierFor(inShell, feature)];
}
