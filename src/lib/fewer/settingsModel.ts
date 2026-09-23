import type { ThemeMode } from "./types";
import { validateTextField, validateUsername } from "./textValidation";

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

/**
 * Validate the three editable profile fields together. Returns the first
 * failure so the dialog can show one message instead of running all three
 * validators when the first already failed. The checks mirror the dialog's
 * current inline validation (no `required` guard on names — empty names are
 * allowed; usernames may not contain "@").
 */
export function validateProfileFields(
  fields: { firstName: string; lastName: string; username: string },
): { ok: boolean; message?: string } {
  const invalid =
    validateTextField(fields.firstName, { label: "First name", max: 100 }) ??
    validateTextField(fields.lastName, { label: "Last name", max: 100 }) ??
    validateUsername(fields.username, { label: "Username", max: 100 });
  if (invalid) return { ok: false, message: invalid };
  return { ok: true };
}

/**
 * Decide whether a save is needed: the edited fields differ from the profile
 * the dialog loaded (`saved`), *and* they still differ from the server's
 * current profile (`fresh`) — the dialog re-fetches the live profile just
 * before saving so a concurrent change that already matches the edit can be
 * skipped.
 */
export function profileNeedsSave(
  saved: ProfileFields,
  fresh: ProfileFields,
  fields: { firstName: string; lastName: string; username: string },
): boolean {
  if (!profileIsDirty(fields, saved)) return false;
  return profileIsDirty(fields, fresh);
}

/**
 * Result of classifying a profile PUT response so the dialog can show one
 * toast and optionally re-sync from the server.
 */
export type SaveOutcome =
  | { kind: "no_changes"; toast: { title: string; description?: string; variant?: "default" | "destructive" } }
  | { kind: "saved"; toast: { title: string; description?: string; variant?: "default" | "destructive" } }
  | { kind: "error"; toast: { title: string; description: string; variant: "destructive" }; revert: boolean };

/**
 * Classify the result of a profile PUT so the dialog can show one toast and
 * optionally re-sync from the server. The dialog still owns the async fetch;
 * this is pure decision logic only. Takes the already-parsed response body
 * (`data`) so the helper stays free of JSON.parse.
 */
export function classifyProfileSave(
  res: Response,
  data: unknown,
  _savedProfile: ProfileFields,
  _edited: { firstName: string; lastName: string; username: string },
): SaveOutcome {
  if (!res.ok) {
    const errorData = data as { error?: string } | null | undefined;
    return {
      kind: "error",
      toast: {
        title: "Could not save profile",
        description: errorData?.error || "Could not save profile",
        variant: "destructive",
      },
      revert: true,
    };
  }
  return { kind: "saved", toast: { title: "Profile updated" } };
}


/**
 * Classified result of the DELETE /api/account call so the dialog can show
 * one toast and decide whether to sign out and close. Pure decision logic —
 * the dialog owns the async fetch and the sign-out/close side effects. Takes
 * the already-parsed response body; falls back to a generic message when the
 * error body carries none.
 */
export type DeleteOutcome =
  | { kind: "scheduled"; toast: { title: string; description: string } }
  | { kind: "error"; toast: { title: string; description: string; variant: "destructive" } };

export function classifyAccountDelete(
  res: Response,
  data: unknown,
): DeleteOutcome {
  if (!res.ok) {
    const errorData = data as { error?: string } | null | undefined;
    return {
      kind: "error",
      toast: {
        title: "Could not delete account",
        description: errorData?.error || "Could not delete account",
        variant: "destructive",
      },
    };
  }
  return {
    kind: "scheduled",
    toast: {
      title: "Deletion scheduled",
      description:
        "Your account will be permanently deleted in 7 days. Sign in again before then to cancel.",
    },
  };
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
 * Advanced tab is desktop-only unless advanced mode is on. Watched and Cloud
 * exist only for signed-in users (tier !== "guest").
 */
export function visibleTabs(opts: {
  tier: string;
  isMobile: boolean;
  advancedMode: boolean;
}): SettingsTabId[] {
  const tabs: SettingsTabId[] = ["account", "about", "appearance"];
  if (opts.tier !== "guest") tabs.push("watched", "cloud");
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

export type ProfileSaveResult =
  | { kind: "saved"; toast: { title: string }; body: ProfileFields }
  | { kind: "no_changes"; toast: { title: string; description: string }; savedProfile: ProfileFields }
  | { kind: "reverted"; toast: { title: string; description?: string; variant?: "default" | "destructive" }; savedProfile: ProfileFields }
  | { kind: "validation_error"; toast: { title: string; description: string; variant: "destructive" } }
  | { kind: "error"; toast: { title: string; description?: string; variant?: "default" | "destructive" } };

/**
 * Orchestrate the profile save: validate → re-fetch/skip → PUT → classify.
 * Extracted from the 44-line handleSaveProfile (CCN 11) so the branching is
 * unit-testable without a DOM.  Returns a discriminated result that the
 * component directly passes to `toast()` and applies to its state.
 */
export async function runProfileSave(opts: {
  fields: { firstName: string; lastName: string; username: string };
  savedProfile: ProfileFields | null;
  fetchProfile: () => Promise<ProfileFields | null>;
  fetchFn?: typeof globalThis.fetch;
}): Promise<ProfileSaveResult> {
  const { fields, savedProfile, fetchProfile, fetchFn = fetch } = opts;

  const validation = validateProfileFields(fields);
  if (!validation.ok) {
    return {
      kind: "validation_error",
      toast: { title: "Could not save profile", description: validation.message!, variant: "destructive" },
    };
  }

  const fresh = await fetchProfile();
  if (fresh && savedProfile) {
    if (!profileNeedsSave(savedProfile, fresh, fields)) {
      return {
        kind: "no_changes",
        toast: { title: "No changes", description: "Nothing was changed." },
        savedProfile: { first_name: fresh.first_name, last_name: fresh.last_name, username: fresh.username },
      };
    }
  }

  const body = buildProfileSaveBody(fields);
  const res = await fetchFn("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body — treated as an empty payload */
  }
  const outcome = classifyProfileSave(res, data, savedProfile ?? body, fields);

  if (outcome.kind === "saved") {
    return { kind: "saved", toast: outcome.toast, body };
  }
  if (outcome.kind === "error" && outcome.revert) {
    const revert = await fetchProfile();
    return {
      kind: "reverted",
      toast: outcome.toast,
      savedProfile: revert
        ? { first_name: revert.first_name, last_name: revert.last_name, username: revert.username }
        : savedProfile ?? body,
    };
  }
  return { kind: "error", toast: outcome.toast };
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