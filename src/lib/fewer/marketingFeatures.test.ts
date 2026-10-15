import { describe, expect, test } from "bun:test";
import {
  CHIP_MAX_WORDS,
  HEADLINE_MAX_WORDS,
  LINE_MAX_WORDS,
  MARKETING_CATEGORIES,
  MARKETING_FEATURES,
  wordCount,
} from "./marketingFeatures";
import { PREVIEW_NODES } from "./marketingPreview";

// The phrases e2e/marketing.spec.ts pins. Asserted here too, so a copy edit
// fails in the fast suite instead of in the browser.
const E2E_PHRASES: Record<string, string> = {
  import: "a GitHub repo",
  search: "Find any file by name",
  groups: "Box files into groups",
  keyboard: "every action has a shortcut",
  organize: "One click re-lays it out",
};

describe("marketingFeatures", () => {
  test("the demo graph is the catalogue: ids match in both directions", () => {
    // The graph is DERIVED from this catalogue (marketingPreview.ts), so the
    // coupling is structural - but the derivation and the bijection are worth
    // pinning: a feature with no card, or a card with no feature, means the
    // canvas and the rail have drifted apart.
    const files = PREVIEW_NODES.filter((n) => n.kind === "file");
    expect(new Set(files.map((n) => n.id))).toEqual(new Set(MARKETING_FEATURES.map((f) => f.id)));
    const folders = PREVIEW_NODES.filter((n) => n.kind === "folder" && n.id !== "root");
    expect(new Set(folders.map((n) => n.id))).toEqual(new Set(MARKETING_CATEGORIES.map((c) => c.id)));
  });

  test("every category lists its features, and every feature is listed once", () => {
    // Set equality, not order: the tour walks MARKETING_FEATURES order while
    // the rail and the graph walk category order, and the two have never been
    // the same sequence (that is a display choice, not drift).
    const listed = MARKETING_CATEGORIES.flatMap((c) => c.features);
    expect(new Set(listed)).toEqual(new Set(MARKETING_FEATURES.map((f) => f.id)));
    expect(new Set(listed).size).toBe(listed.length);
    // Category ids are node ids too: they must not collide with feature ids,
    // or a folder card and a file card would share one identity on the canvas.
    const categoryIds = MARKETING_CATEGORIES.map((c) => c.id);
    const featureIds = new Set(MARKETING_FEATURES.map((f) => f.id));
    expect(categoryIds.filter((id) => featureIds.has(id))).toEqual([]);
  });

  test("ids and chip labels are unique", () => {
    const ids = MARKETING_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const chips = MARKETING_FEATURES.map((f) => f.chip);
    expect(new Set(chips).size).toBe(chips.length);
  });

  test("copy stays inside the reading budget", () => {
    for (const feature of MARKETING_FEATURES) {
      expect(wordCount(feature.chip)).toBeLessThanOrEqual(CHIP_MAX_WORDS);
      expect(wordCount(feature.headline)).toBeLessThanOrEqual(HEADLINE_MAX_WORDS);
      expect(wordCount(feature.line)).toBeLessThanOrEqual(LINE_MAX_WORDS);
    }
  });

  test("the phrases the e2e pins are still in the copy", () => {
    for (const [id, phrase] of Object.entries(E2E_PHRASES)) {
      const feature = MARKETING_FEATURES.find((f) => f.id === id)!;
      expect(feature).toBeDefined();
      expect(`${feature.chip} ${feature.headline} ${feature.line}`).toContain(phrase);
    }
  });

  test("vocabulary is cards, never nodes", () => {
    for (const feature of MARKETING_FEATURES) {
      expect(`${feature.headline} ${feature.line}`).not.toMatch(/\bnodes?\b/);
    }
  });

  test("gated features are marked and no copy points at a purchase path", () => {
    // Nothing on the rail is gated today (T-161 cut tags, the one Pro
    // feature), so the honest answer is an empty list. The badge itself stays
    // in the inspector: the next gated feature gets it for free.
    const gated = MARKETING_FEATURES.filter((f) => f.tier === "pro").map((f) => f.id);
    expect(gated).toEqual([]);
    for (const feature of MARKETING_FEATURES) {
      // There is no per-feature link any more, so the guard is the copy: a
      // feature must never hint at a purchase path that does not exist while
      // billing is off.
      const copy = `${feature.chip} ${feature.headline} ${feature.line}`;
      expect(copy).not.toMatch(/docs\/plans|pricing|upgrade|buy/i);
    }
  });

  test("each feature demonstrates a different proof", () => {
    const kinds = MARKETING_FEATURES.map((f) => f.proof);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
