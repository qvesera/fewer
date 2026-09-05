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

test("buildTagRingGradient: two colors split 50/50 (hard stops)", () => {
  expect(buildTagRingGradient(["#f00", "#00f"])).toBe("conic-gradient(#f00 0%, #f00 50%, #00f 50%, #00f 100%)");
});

test("buildTagRingGradient: three colors split evenly (33.33 each)", () => {
  const g = buildTagRingGradient(["#f00", "#0f0", "#00f"]);
  expect(g).toContain("#f00 0%");
  expect(g).toContain("#0f0 33.33%");
  expect(g).toContain("#00f 66.67%");
});

test("buildTagRingGradient: caps at 5 slices", () => {
  const g = buildTagRingGradient(["#1", "#2", "#3", "#4", "#5", "#6"]);
  const stops = g.match(/#/g) ?? [];
  // 5 colors × 2 stops each = 10 hex markers
  expect(stops.length).toBe(10);
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
