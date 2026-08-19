import { describe, expect, test } from "bun:test";
import { FREE_LIMITS, PRO_LIMITS, limitsFor, overLimit } from "./plans";

describe("plans", () => {
  test("unknown or missing plans fall back to free limits", () => {
    expect(limitsFor("pro")).toBe(PRO_LIMITS);
    expect(limitsFor("free")).toBe(FREE_LIMITS);
    expect(limitsFor(null)).toBe(FREE_LIMITS);
    expect(limitsFor(undefined)).toBe(FREE_LIMITS);
    expect(limitsFor("team" as "free")).toBe(FREE_LIMITS);
  });

  test("overLimit respects the exact boundary and ignores failed counts", () => {
    expect(overLimit(FREE_LIMITS.savedGraphs, FREE_LIMITS.savedGraphs)).toBe(true);
    expect(overLimit(FREE_LIMITS.savedGraphs - 1, FREE_LIMITS.savedGraphs)).toBe(false);
    expect(overLimit(-1, FREE_LIMITS.savedGraphs)).toBe(false);
    expect(overLimit(1000, PRO_LIMITS.savedGraphs)).toBe(false); // Infinity = never over
  });
});
