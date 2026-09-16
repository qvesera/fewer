import type { ThemeMode } from "./types";

/**
 * Pure model for the Settings dialog (src/components/fewer/SettingsDialog.tsx).
 * The dialog's decisions live here so they can be unit-tested without a DOM:
 * profile-response normalisation, the unsaved-changes check, the usage meters,
 * which tabs exist under which conditions, and the option lists whose shape
 * depends on other settings.
 */

export type PlanId = "free" | "pro" | "team";

export type SettingsTabId =
  | "account"
  | "about"
  | "appearance"
  | "watched"
  | "cloud"
  | "advanced"
  | "help";

export interface ProfileFields {
  first_name: string;
  last_name: string;
  username: string;
}

export interface UsageCounts {
  savedGraphs: number;
  watchedIndexes: number;
}

export interface NormalizedProfile extends ProfileFields {
  plan: PlanId;
  usage: UsageCounts;
}

/**
 * Normalise the /api/profile response into dialog state. The API returns
 * unknown JSON; every field is coerced defensively — strings default to "",
 * the plan to "free", and counts to -1 ("unknown"), matching what the meters
 * render for an unmeasured account. Returns null when the response carries no
 * profile (signed out); callers keep their current state then.
 */
export function normalizeProfileResponse(json: unknown): NormalizedProfile | null {
  const raw = (json ?? {}) as { profile?: Record<string, unknown>; counts?: Record<string, unknown> };
  if (!raw.profile) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const count = (v: unknown) => (typeof v === "number" ? v : -1);
  const counts = raw.counts ?? {};
  return {
    first_name: str(raw.profile.first_name),
    last_name: str(raw.profile.last_name),
    username: str(raw.profile.username),
    plan: raw.profile.plan === "pro" || raw.profile.plan === "team" ? (raw.profile.plan as PlanId) : "free",
    usage: {
      savedGraphs: count(counts.savedGraphs),
      watchedIndexes: count(counts.watchedIndexes),
    },
  };
}

/** Body for the PUT /api/profile request: trimmed names and a lowercased
 *  username (the server stores usernames case-insensitively-unique). */
export function buildProfileSaveBody(fields: {
  firstName: string;
  lastName: string;
  username: string;
}): ProfileFields {
  return {
    first_name: fields.firstName.trim(),
    last_name: fields.lastName.trim(),
    username: fields.username.trim().toLowerCase(),
  };
}

/**
 * True when the edited profile differs from the persisted one — the Save
 * button stays disabled while unchanged. Inputs are compared trimmed, the same
 * way the save path normalises them; the stored username is already lowercase,
 * so an un-normalised case edit counts as unsaved (it will rewrite on save).
 */
export function profileIsDirty(
  edited: { firstName: string; lastName: string; username: string },
  saved: ProfileFields,
): boolean {
  return !(
    edited.firstName.trim() === saved.first_name &&
    edited.lastName.trim() === saved.last_name &&
    edited.username.trim() === saved.username
  );
}

export interface UsageMeter {
  /** False for an unlimited quota (Infinity) — the bar is not rendered. */
  visible: boolean;
  /** Fill percentage, capped at 100. */
  pct: number;
  /** The plan limit is reached — the bar turns destructive. */
  over: boolean;
}

/** One usage meter (saved graphs / watched indexes). */
export function usageMeter(used: number, limit: number): UsageMeter {
  const visible = limit !== Infinity;
  return {
    visible,
    pct: visible ? Math.min(100, (used / limit) * 100) : 0,
    over: used >= limit,
  };
}

/**
 * Which settings tabs exist for the current viewer, in tab-strip order. The
 * Advanced tab is desktop-only unless advanced mode is on — for a signed-out
 * mobile user it would be empty (its cards are sign-in or desktop gated).
 * Watched and Cloud exist only for signed-in users.
 */
export function visibleTabs(opts: {
  signedIn: boolean;
  isMobile: boolean;
  advancedMode: boolean;
}): SettingsTabId[] {
  const tabs: SettingsTabId[] = ["account", "about", "appearance"];
  if (opts.signedIn) tabs.push("watched", "cloud");
  if (opts.advancedMode || !opts.isMobile) tabs.push("advanced");
  tabs.push("help");
  return tabs;
}

export type EdgeStrokeOption = { value: "solid" | "dashed" | "dotted"; label: string };

/** Stroke-pattern choices for edge styling. "Solid" only makes sense when at
 *  least some edges keep a solid base — not when ALL edges are animated. */
export function strokeStyleOptions(edgeAnimated: boolean): EdgeStrokeOption[] {
  const list: EdgeStrokeOption[] = [];
  if (!edgeAnimated) list.push({ value: "solid", label: "Solid" });
  list.push({ value: "dashed", label: "Dashed" });
  list.push({ value: "dotted", label: "Dotted" });
  return list;
}

/** Theme buttons: the custom-theme editor entry appears only in advanced mode. */
export function themeModeOptions(advancedMode: boolean): ThemeMode[] {
  return advancedMode ? ["light", "dark", "custom"] : ["light", "dark"];
}

/**
 * Minimap drag/slider bounds: the maximum offset keeps the minimap fully on
 * the canvas, with a floor of its own size so the slider stays usable before
 * the canvas has been measured.
 */
export function minimapBounds(
  canvas: { width: number; height: number },
  size: number,
): { maxX: number; maxY: number } {
  return {
    maxX: Math.max(canvas.width - size, size),
    maxY: Math.max(canvas.height - size, size),
  };
}