import { test, expect } from "bun:test";
import {
  buildTagRingGradient,
  firstTagId,
  makeTagLabelLookup,
  colorForTag,
  compareSiblingsByTag,
  TAG_FALLBACK_COLOR,
} from "./tags";
import type { Tag } from "./tags";
import type { FewerNode } from "./types";

const tags: Tag[] = [
  { id: "t1", label: "Beta", color: "#f87171" },
  { id: "t2", label: "Alpha", color: "#60a5fa" },
  { id: "t3", label: "Gamma", color: "#34d399" },
];

function node(id: string, label: string, tagIds: string[] = []): FewerNode {
  return { id, type: "folder", position: { x: 0, y: 0 }, data: { label, path: `/${label}`, type: "folder", tagIds } } as FewerNode;
}

test("buildTagRingGradient: empty → empty string", () => {
  expect(buildTagRingGradient([])).toBe("");
});

test("buildTagRingGradient: single color → solid", () => {
  expect(buildTagRingGradient(["#f87171"])).toBe("#f87171");
});

test("buildTagRingGradient: two colors — first color lands on the LEFT side", () => {
  // CSS conic-gradient starts at 12 o'clock clockwise; reversing the list puts
  // the first color (#f00) in the 50–100% span = the LEFT half of the ring.
  expect(buildTagRingGradient(["#f00", "#00f"])).toBe("conic-gradient(#00f 0%, #00f 50%, #f00 50%, #f00 100%)");
});

test("buildTagRingGradient: three colors step evenly, first color last (left side)", () => {
  const g = buildTagRingGradient(["#f00", "#0f0", "#00f"]);
  expect(g).toContain("#00f 0%");
  expect(g).toContain("#0f0 33.33%");
  expect(g).toContain("#f00 66.67%");
});

test("buildTagRingGradient: caps at 5 slices", () => {
  const g = buildTagRingGradient(["#1", "#2", "#3", "#4", "#5", "#6"]);
  const stops = g.match(/#/g) ?? [];
  // 5 colors × 2 stops each = 10 hex markers
  expect(stops.length).toBe(10);
});

test("buildTagRingGradient: odd count splits by OUTLINE LENGTH on a 2:1 card", () => {
  // Equal-angle thirds would render a short middle band on a 240×120 rect.
  // Perimeter stops put the boundaries exactly on the bottom corners → equal
  // band lengths. First color (#f00) is on the left, as the display order.
  const g = buildTagRingGradient(["#f00", "#0f0", "#00f"], { width: 240, height: 120 });
  expect(g).toBe(
    "conic-gradient(#00f 0%, #00f 32.38%, #0f0 32.38%, #0f0 67.62%, #f00 67.62%, #f00 100%)",
  );
});

test("buildTagRingGradient: equal-angle fallback when dims are invalid", () => {
  // Invalid dims fall back to equal-angle stops; ring geometry still reversed.
  expect(buildTagRingGradient(["#f00", "#0f0", "#00f"], { width: 0, height: 120 }))
    .toContain("#00f 0%");
  expect(buildTagRingGradient(["#f00", "#0f0", "#00f"], { width: -1, height: 0 }))
    .toContain("#0f0 33.33%");
});

test("buildTagRingGradient: square card keeps uniform angle stops", () => {
  // On a square, equal perimeter = equal angle, so a 50/50 split is unchanged.
  expect(buildTagRingGradient(["#f00", "#00f"], { width: 200, height: 200 }))
    .toBe("conic-gradient(#00f 0%, #00f 50%, #f00 50%, #f00 100%)");
});

test("firstTagId returns first id or null", () => {
  expect(firstTagId(node("a", "A", ["t2", "t1"]))).toBe("t2");
  expect(firstTagId(node("b", "B"))).toBeNull();
  expect(firstTagId(node("c", "C", []))).toBeNull();
});

test("makeTagLabelById resolves labels, unknown → empty", () => {
  const lookup = makeTagLabelLookup(tags);
  expect(lookup("t2")).toBe("Alpha");
  expect(lookup("nope")).toBe("");
});

test("colorForTag resolves registry color, unknown → fallback", () => {
  expect(colorForTag(tags, "t1")).toBe("#f87171");
  expect(colorForTag(tags, "nope")).toBe(TAG_FALLBACK_COLOR);
});

test("compareSiblingsByTag: asc — tagged first, alphabetical by label", () => {
  const a = node("a", "A", ["t1"]); // Beta
  const b = node("b", "B", ["t2"]); // Alpha
  const lookup = makeTagLabelLookup(tags);
  // Alpha (b) before Beta (a) in asc
  expect(compareSiblingsByTag(a, b, lookup, "asc")).toBeGreaterThan(0);
  expect(compareSiblingsByTag(b, a, lookup, "asc")).toBeLessThan(0);
});

test("compareSiblingsByTag: untagged always trails", () => {
  const tagged = node("a", "A", ["t3"]);
  const untagged = node("b", "B", []);
  const lookup = makeTagLabelLookup(tags);
  expect(compareSiblingsByTag(tagged, untagged, lookup, "asc")).toBeLessThan(0);
  expect(compareSiblingsByTag(untagged, tagged, lookup, "asc")).toBeGreaterThan(0);
  // Even in desc, untagged trails (tagged group simply flips as a block).
  expect(compareSiblingsByTag(tagged, untagged, lookup, "desc")).toBeGreaterThan(0);
});

test("compareSiblingsByTag: same tag → name tie-break (never inverted)", () => {
  const a = node("a", "Apple", ["t1"]);
  const b = node("b", "Banana", ["t1"]);
  const lookup = makeTagLabelLookup(tags);
  expect(compareSiblingsByTag(a, b, lookup, "asc")).toBeLessThan(0);
  expect(compareSiblingsByTag(a, b, lookup, "desc")).toBeLessThan(0);
});
