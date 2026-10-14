import { describe, expect, test } from "bun:test";
import {
  CHIP_MAX_WORDS,
  HEADLINE_MAX_WORDS,
  LINE_MAX_WORDS,
  MARKETING_FEATURES,
  previewPins,
  wordCount,
} from "./marketingFeatures";
import { PREVIEW_CANVAS, PREVIEW_NODES, nodeBox } from "./marketingPreview";

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
      expect(feature.href.startsWith("/docs/")).toBe(true);
      expect(feature.href).not.toContain("/docs/plans");
    }
  });

  test("each feature demonstrates a different proof", () => {
    const kinds = MARKETING_FEATURES.map((f) => f.proof);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  test("one pin per feature, inside the canvas", () => {
    const pins = previewPins();
    expect(pins).toHaveLength(MARKETING_FEATURES.length);
    expect(new Set(pins.map((p) => p.id)).size).toBe(pins.length);
    for (const pin of pins) {
      expect(pin.x).toBeGreaterThanOrEqual(0);
      expect(pin.x).toBeLessThanOrEqual(PREVIEW_CANVAS.w);
      expect(pin.label).toBeTruthy();
    }
  });

  test("pins sit on the card's right edge, or its left at the canvas edge", () => {
    const pins = previewPins();
    const root = nodeBox(PREVIEW_NODES.find((n) => n.id === "root")!);
    for (const pin of pins.filter((p) => p.nodeId === "root")) {
      expect(pin.x).toBe(root.x + root.w);
    }

    // layout.ts starts at x=640 with a 220px card: its right edge IS the
    // canvas edge, so its pin sits on its left edge instead.
    const layout = nodeBox(PREVIEW_NODES.find((n) => n.id === "layout")!);
    for (const pin of pins.filter((p) => p.nodeId === "layout")) {
      expect(pin.x).toBe(layout.x);
    }
  });

  test("no card carries more hotspots than its edge can stack", () => {
    // PreviewGraph stacks a card's pins 32 SCREEN px apart, and the shortest
    // card is 58px tall, so four is the most any one card may carry.
    const perCard = new Map<string, number>();
    for (const pin of previewPins()) {
      perCard.set(pin.nodeId, (perCard.get(pin.nodeId) ?? 0) + 1);
    }
    for (const count of perCard.values()) expect(count).toBeLessThanOrEqual(4);
    expect(perCard.get("root")).toBe(4);
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
