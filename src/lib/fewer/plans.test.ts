import { describe, expect, test } from "bun:test";
import { FREE_LIMITS, PRO_LIMITS, limitsFor, overLimit } from "./plans";

describe("plans", () => {
  test("unknown or missing plans fall back to free limits", () => {
    expect(limitsFor("pro")).toBe(PRO_LIMITS);
    expect(limitsFor("free")).toBe(FREE_LIMITS);
    expect(limitsFor(null)).toBe(FREE_LIMITS);
    expect(limitsFor(undefined)).toBe(FREE_LIMITS);
    expect(limitsFor("team")).toBe(PRO_LIMITS);
    expect(limitsFor("bogus" as "free")).toBe(FREE_LIMITS);
  });

  test("overLimit respects the exact boundary and ignores failed counts", () => {
    expect(overLimit(FREE_LIMITS.savedGraphs, FREE_LIMITS.savedGraphs)).toBe(true);
    expect(overLimit(FREE_LIMITS.savedGraphs - 1, FREE_LIMITS.savedGraphs)).toBe(false);
    expect(overLimit(-1, FREE_LIMITS.savedGraphs)).toBe(false);
    expect(overLimit(1000, PRO_LIMITS.savedGraphs)).toBe(false); // Infinity = never over
  });

  test("version history is pro-only; pro watches are metered at 10", () => {
    expect(FREE_LIMITS.versionHistory).toBe(false);
    expect(PRO_LIMITS.versionHistory).toBe(true);
    expect(PRO_LIMITS.watchedIndexes).toBe(10);
    expect(overLimit(PRO_LIMITS.watchedIndexes, PRO_LIMITS.watchedIndexes)).toBe(true);
    expect(overLimit(PRO_LIMITS.watchedIndexes - 1, PRO_LIMITS.watchedIndexes)).toBe(false);
  });
});
