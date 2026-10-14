import { describe, expect, test } from "bun:test";
import {
  CHIP_MAX_WORDS,
  HEADLINE_MAX_WORDS,
  LINE_MAX_WORDS,
  MARKETING_FEATURES,
  wordCount,
} from "./marketingFeatures";
import { PREVIEW_NODES } from "./marketingPreview";

// The phrases e2e/marketing.spec.ts pins. Asserted here too, so a copy edit
// fails in the fast suite instead of in the browser.
const E2E_PHRASES: Record<string, string> = {
  import: "a GitHub repo",
  keyboard: "search across every card",
  export: "Export in 8 formats",
  groups: "Canvas groups",
};

describe("marketingFeatures", () => {
  test("every anchor resolves to a real card in the demo tree", () => {
    const ids = new Set(PREVIEW_NODES.map((n) => n.id));
    for (const feature of MARKETING_FEATURES) {
      expect(ids.has(feature.anchor)).toBe(true);
    }
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
    // MIN_TIER.tags is pro and the licence rail ships off (T-148), so tags is
    // the one advertised feature that must carry the Pro badge.
    const gated = MARKETING_FEATURES.filter((f) => f.tier === "pro").map((f) => f.id);
    expect(gated).toEqual(["tags"]);
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

  test("every hotspot lights a real card, and nearly all create contrast", () => {
    const ids = new Set(PREVIEW_NODES.map((n) => n.id));
    for (const feature of MARKETING_FEATURES) {
      expect(feature.on.length).toBeGreaterThan(0);
      for (const id of feature.on) expect(ids.has(id)).toBe(true);
    }
    // The playground's whole idea is contrast between the cards a feature
    // touches and the rest. A hotspot that lights every card would look like
    // nothing happened; Organize is the single deliberate exception, because
    // re-flowing the tree IS the whole tree.
    const flat = MARKETING_FEATURES.filter((f) => f.on.length === PREVIEW_NODES.length);
    expect(flat.map((f) => f.id)).toEqual(["organize"]);
  });
});
