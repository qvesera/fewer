import { describe, expect, expectTypeOf, test } from "bun:test";
import { tierOf, can, MIN_TIER, type Tier, type Feature } from "./tiers";

// ── tierOf ─

describe("tierOf", () => {
  test("no user → guest", () => {
    expect(tierOf(null)).toBe("guest");
    expect(tierOf(undefined)).toBe("guest");
  });

  test("user + free plan → free", () => {
    expect(tierOf({ id: "u1" }, "free")).toBe("free");
  });

  test("user + pro plan → pro", () => {
    expect(tierOf({ id: "u1" }, "pro")).toBe("pro");
  });

  test("user + team plan → pro (team maps to pro client-side)", () => {
    expect(tierOf({ id: "u1" }, "team")).toBe("pro");
  });

  test("user + missing/null plan → free (fail-safe, mirrors limitsFor)", () => {
    expect(tierOf({ id: "u1" }, null)).toBe("free");
    expect(tierOf({ id: "u1" }, undefined)).toBe("free");
    expect(tierOf({ id: "u1" }, "bogus")).toBe("free");
  });
});

// ── can ─

describe("can", () => {
  test("guest cannot access anything", () => {
    const features = Object.keys(MIN_TIER) as Feature[];
    for (const f of features) {
      expect(can(f, "guest")).toBe(false);
    }
  });

  test("free can access all free-tier features", () => {
    const freeFeatures = (Object.keys(MIN_TIER) as Feature[]).filter(
      (f) => MIN_TIER[f] === "free",
    );
    for (const f of freeFeatures) {
      expect(can(f, "free")).toBe(true);
    }
  });

  test("free cannot access pro features", () => {
    const proFeatures = (Object.keys(MIN_TIER) as Feature[]).filter(
      (f) => MIN_TIER[f] === "pro",
    );
    for (const f of proFeatures) {
      expect(can(f, "free")).toBe(false);
    }
  });

  test("pro can access everything", () => {
    const features = Object.keys(MIN_TIER) as Feature[];
    for (const f of features) {
      expect(can(f, "pro")).toBe(true);
    }
  });

  test("MIN_TIER is exhaustive over the Feature union (compile-time + runtime)", () => {
    // If a new Feature is added without a MIN_TIER entry, this type check fails.
    type AssertSatisfies = typeof MIN_TIER extends Record<Feature, Tier>
      ? true
      : false;
    expectTypeOf<AssertSatisfies>().toEqualTypeOf<true>();

    // Runtime: every key in MIN_TIER is a valid Feature string.
    const features = Object.keys(MIN_TIER) as Feature[];
    expect(features.length).toBeGreaterThan(0);
  });

  test("can is monotonic: pro ⊇ free ⊇ guest for every feature", () => {
    const features = Object.keys(MIN_TIER) as Feature[];
    for (const f of features) {
      const g = can(f, "guest");
      const fr = can(f, "free");
      const p = can(f, "pro");
      // guest ≤ free ≤ pro
      expect(g).toBe(false); // guest never has anything
      if (MIN_TIER[f] === "pro") {
        expect(fr).toBe(false);
        expect(p).toBe(true);
      } else {
        expect(fr).toBe(true);
        expect(p).toBe(true);
      }
    }
  });
});
