import { describe, expect, it } from "bun:test";
import {
  buildProfileSaveBody,
  classifyProfileSave,
  minimapBounds,
  normalizeProfileResponse,
  profileIsDirty,
  profileNeedsSave,
  strokeStyleOptions,
  themeModeOptions,
  usageMeter,
  validateProfileFields,
  visibleTabs,
} from "./settingsModel";

// The Settings dialog's pure decisions. Its JSX wires the store; everything
// below is the decision logic that used to live inline, untested.

// ─── normalizeProfileResponse ─────────────────────────────────────

describe("normalizeProfileResponse", () => {
  it("keeps the happy path untouched", () => {
    const out = normalizeProfileResponse({
      profile: { first_name: "Ada", last_name: "Lovelace", username: "ada", plan: "pro" },
      counts: { savedGraphs: 3, watchedIndexes: 1 },
    });
    expect(out).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      username: "ada",
      plan: "pro",
      usage: { savedGraphs: 3, watchedIndexes: 1 },
    });
  });

  it("returns null when there is no profile (signed out)", () => {
    expect(normalizeProfileResponse({})).toBeNull();
    expect(normalizeProfileResponse({ counts: { savedGraphs: 1 } })).toBeNull();
    expect(normalizeProfileResponse(null)).toBeNull();
  });

  it("coerces wrong-typed fields instead of trusting the API", () => {
    const out = normalizeProfileResponse({
      profile: { first_name: 42, last_name: null, username: {}, plan: "enterprise" },
      counts: { savedGraphs: "many", watchedIndexes: true },
    });
    expect(out).toEqual({
      first_name: "",
      last_name: "",
      username: "",
      plan: "free",
      usage: { savedGraphs: -1, watchedIndexes: -1 },
    });
  });

  it("defaults missing counts to unknown (-1) and team plans pass through", () => {
    const out = normalizeProfileResponse({ profile: { username: "z", plan: "team" } });
    expect(out!.plan).toBe("team");
    expect(out!.usage).toEqual({ savedGraphs: -1, watchedIndexes: -1 });
  });
});

// ─── save body + unsaved-changes check ────────────────────────────

describe("buildProfileSaveBody", () => {
  it("trims names and lowercases the username like the server stores it", () => {
    expect(
      buildProfileSaveBody({ firstName: "  Ada ", lastName: " Lovelace ", username: "  ADA " }),
    ).toEqual({ first_name: "Ada", last_name: "Lovelace", username: "ada" });
  });
});

describe("profileIsDirty", () => {
  it("ignores surrounding whitespace but not username case", () => {
    const saved = { first_name: "Ada", last_name: "Lovelace", username: "ada" };
    expect(profileIsDirty({ firstName: " Ada ", lastName: "Lovelace", username: "ada" }, saved)).toBe(false);
    // The stored username is lowercase; a case-only edit will rewrite on save.
    expect(profileIsDirty({ firstName: "Ada", lastName: "Lovelace", username: "ADA" }, saved)).toBe(true);
    expect(profileIsDirty({ firstName: "Ada", lastName: "Byron", username: "ada" }, saved)).toBe(true);
  });

  it("is false for the untouched defaults", () => {
    const empty = { first_name: "", last_name: "", username: "" };
    expect(profileIsDirty({ firstName: "", lastName: "", username: "" }, empty)).toBe(false);
  });
});

// ─── profile save validation ───────────────────────────────────

describe("validateProfileFields", () => {
  it("accepts a complete valid profile", () => {
    expect(validateProfileFields({ firstName: "Ada", lastName: "Lovelace", username: "ada" })).toEqual({ ok: true });
  });

  it("rejects a username containing '@'", () => {
    expect(
      validateProfileFields({ firstName: "Ada", lastName: "Lovelace", username: "bad@name" }),
    ).toEqual({ ok: false, message: "Username can't contain \"@\"." });
  });

  it("stops at the first failure — a dangerous first name short-circuits the rest", () => {
    expect(
      validateProfileFields({ firstName: "null", lastName: "Lovelace", username: "bad@name" }),
    ).toEqual({ ok: false, message: "First name has an invalid value and can't be saved." });
  });

  it("does not enforce required names — empty is allowed, mirroring the dialog", () => {
    expect(validateProfileFields({ firstName: "", lastName: "", username: "" })).toEqual({ ok: true });
  });

  it("rejects names over 100 characters", () => {
    expect(
      validateProfileFields({ firstName: "a".repeat(101), lastName: "", username: "" }),
    ).toEqual({ ok: false, message: "First name must be 100 characters or fewer." });
  });

  it("accepts a username with surrounding spaces — trim happens only in buildProfileSaveBody", () => {
    expect(validateProfileFields({ firstName: "Ada", lastName: "Lovelace", username: "  ada  " })).toEqual({ ok: true });
  });
});

// ─── pre-save dirty decision ──────────────────────────────────

describe("profileNeedsSave", () => {
  const saved = { first_name: "Ada", last_name: "Lovelace", username: "ada" };
  const edited = { firstName: "Ada", lastName: "Lovelace", username: "ada_new" };

  it("is false when nothing was edited", () => {
    expect(profileNeedsSave(saved, saved, { firstName: "Ada", lastName: "Lovelace", username: "ada" })).toBe(false);
  });

  it("is true when the edit differs from both the loaded and the live profile", () => {
    expect(profileNeedsSave(saved, saved, edited)).toBe(true);
  });

  it("is false when the live server profile already matches the edit (re-fetch correction)", () => {
    const fresh = { first_name: "Ada", last_name: "Lovelace", username: "ada_new" };
    expect(profileNeedsSave(saved, fresh, edited)).toBe(false);
  });

  it("ignores surrounding whitespace the same way the save path normalises it", () => {
    expect(profileNeedsSave(saved, saved, { firstName: " Ada ", lastName: "Lovelace", username: "ada" })).toBe(false);
  });
});

// ─── save-outcome classification ─────────────────────────────────

describe("classifyProfileSave", () => {
  const saved = { first_name: "Ada", last_name: "Lovelace", username: "ada" };
  const edited = { firstName: "Ada", lastName: "Lovelace", username: "ada_new" };

  it("classifies a 200 as saved with the exact toast the dialog shows", () => {
    const outcome = classifyProfileSave(new Response(null, { status: 200 }), {}, saved, edited);
    expect(outcome).toEqual({ kind: "saved", toast: { title: "Profile updated" } });
  });

  it("classifies a non-2xx response as an error carrying the server message, with revert", () => {
    const res = new Response(JSON.stringify({ error: "Username taken" }), { status: 409 });
    const outcome = classifyProfileSave(res, { error: "Username taken" }, saved, edited);
    expect(outcome).toEqual({
      kind: "error",
      toast: { title: "Could not save profile", description: "Username taken", variant: "destructive" },
      revert: true,
    });
  });

  it("falls back to a generic description when the error body carries no message", () => {
    const res = new Response(null, { status: 500 });
    const outcome = classifyProfileSave(res, null, saved, edited);
    expect(outcome).toEqual({
      kind: "error",
      toast: { title: "Could not save profile", description: "Could not save profile", variant: "destructive" },
      revert: true,
    });
  });
});

// ─── usage meters ─────────────────────────────────────────────────

describe("usageMeter", () => {
  it("caps the fill at 100 and flags the limit as reached", () => {
    expect(usageMeter(3, 5)).toEqual({ visible: true, pct: 60, over: false });
    expect(usageMeter(5, 5)).toEqual({ visible: true, pct: 100, over: true });
    expect(usageMeter(12, 5)).toEqual({ visible: true, pct: 100, over: true });
  });

  it("hides the bar for an unlimited quota", () => {
    expect(usageMeter(999, Infinity)).toEqual({ visible: false, pct: 0, over: false });
  });
});

// ─── tab visibility ───────────────────────────────────────────────

describe("visibleTabs", () => {
  it("shows the advanced tab on desktop even without advanced mode", () => {
    expect(visibleTabs({ signedIn: false, isMobile: false, advancedMode: false })).toEqual([
      "account",
      "about",
      "appearance",
      "advanced",
      "help",
    ]);
  });

  it("hides advanced for a signed-out mobile user — the tab would be empty", () => {
    expect(visibleTabs({ signedIn: false, isMobile: true, advancedMode: false })).toEqual([
      "account",
      "about",
      "appearance",
      "help",
    ]);
  });

  it("advanced mode brings the tab back on mobile; signed-in tabs append", () => {
    expect(visibleTabs({ signedIn: true, isMobile: true, advancedMode: true })).toEqual([
      "account",
      "about",
      "appearance",
      "watched",
      "cloud",
      "advanced",
      "help",
    ]);
  });

  it("watches and cloud are sign-in only", () => {
    const tabs = visibleTabs({ signedIn: false, isMobile: false, advancedMode: true });
    expect(tabs).toContain("advanced");
    expect(tabs).not.toContain("watched");
    expect(tabs).not.toContain("cloud");
  });
});

// ─── option lists ─────────────────────────────────────────────────

describe("strokeStyleOptions", () => {
  it("keeps Solid while some edges stay solid", () => {
    expect(strokeStyleOptions(false).map((o) => o.value)).toEqual(["solid", "dashed", "dotted"]);
  });

  it("drops Solid when ALL edges are animated", () => {
    expect(strokeStyleOptions(true).map((o) => o.value)).toEqual(["dashed", "dotted"]);
  });
});

describe("themeModeOptions", () => {
  it("offers the custom editor only in advanced mode", () => {
    expect(themeModeOptions(false)).toEqual(["light", "dark"]);
    expect(themeModeOptions(true)).toEqual(["light", "dark", "custom"]);
  });
});

// ─── minimap bounds ───────────────────────────────────────────────

describe("minimapBounds", () => {
  it("keeps the minimap on-canvas with a floor for unmeasured canvases", () => {
    expect(minimapBounds({ width: 1000, height: 800 }, 160)).toEqual({ maxX: 840, maxY: 640 });
    // Canvas smaller than the minimap (not yet measured): the floor wins.
    expect(minimapBounds({ width: 0, height: 0 }, 160)).toEqual({ maxX: 160, maxY: 160 });
  });
});