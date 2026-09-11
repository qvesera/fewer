import { describe, expect, test } from "bun:test";
import { FREE_LIMITS, PRO_LIMITS, TEAM_LIMITS, GUEST_LIMITS, limitsFor, overLimit, formatUsage } from "./plans";

describe("plans", () => {
  test("unknown or missing plans fall back to free limits", () => {
    expect(limitsFor("pro")).toBe(PRO_LIMITS);
    expect(limitsFor("team")).toBe(TEAM_LIMITS);
    expect(limitsFor("free")).toBe(FREE_LIMITS);
    expect(limitsFor(null)).toBe(FREE_LIMITS);
    expect(limitsFor(undefined)).toBe(FREE_LIMITS);
    expect(limitsFor("bogus" as "free")).toBe(FREE_LIMITS);
  });

  test("guest tier is entirely local: no saved graphs, no themes, no short links", () => {
    expect(GUEST_LIMITS.savedGraphs).toBe(0);
    expect(GUEST_LIMITS.watchedIndexes).toBe(0);
    expect(GUEST_LIMITS.historyDays).toBe(0);
    expect(GUEST_LIMITS.savedThemes).toBe(false);
    expect(GUEST_LIMITS.largeShareLinks).toBe(false);
    expect(GUEST_LIMITS.cloudConnections).toBe(false);
    expect(GUEST_LIMITS.inviteSharing).toBe(false);
  });

  test("free = 3 saved graphs, 30-day history; pro/team = unlimited, 1-year", () => {
    expect(FREE_LIMITS.savedGraphs).toBe(3);
    expect(FREE_LIMITS.historyDays).toBe(30);
    expect(PRO_LIMITS.savedGraphs).toBe(Infinity);
    expect(PRO_LIMITS.historyDays).toBe(365);
    expect(TEAM_LIMITS.historyDays).toBe(365);
  });

  test("saved themes and large-payload share links are pro+", () => {
    expect(FREE_LIMITS.savedThemes).toBe(false);
    expect(FREE_LIMITS.largeShareLinks).toBe(false);
    expect(PRO_LIMITS.savedThemes).toBe(true);
    expect(PRO_LIMITS.largeShareLinks).toBe(true);
    expect(TEAM_LIMITS.savedThemes).toBe(true);
  });

  test("overLimit respects the exact boundary and ignores failed counts", () => {
    expect(overLimit(FREE_LIMITS.savedGraphs, FREE_LIMITS.savedGraphs)).toBe(true);
    expect(overLimit(FREE_LIMITS.savedGraphs - 1, FREE_LIMITS.savedGraphs)).toBe(false);
    expect(overLimit(-1, FREE_LIMITS.savedGraphs)).toBe(false);
    expect(overLimit(1000, PRO_LIMITS.savedGraphs)).toBe(false); // Infinity = never over
  });

  test("pro watches are metered at 10 (free stays 3)", () => {
    expect(PRO_LIMITS.watchedIndexes).toBe(10);
    expect(overLimit(PRO_LIMITS.watchedIndexes, PRO_LIMITS.watchedIndexes)).toBe(true);
    expect(overLimit(PRO_LIMITS.watchedIndexes - 1, PRO_LIMITS.watchedIndexes)).toBe(false);
  });
});

describe("formatUsage", () => {
  test("renders capped, unlimited, and failed-count labels", () => {
    expect(formatUsage(2, 3)).toBe("2 of 3");
    expect(formatUsage(12, 10)).toBe("12 of 10");
    expect(formatUsage(-1, 3)).toBe("—");
    expect(formatUsage(40, Infinity)).toBe("Unlimited");
  });
});
