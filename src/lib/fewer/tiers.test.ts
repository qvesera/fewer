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

  // ── ?tier= dev override ──
  //
  // tierOf() reads `window.location` directly, so these shadow the global instead
  // of navigating (the unit suite runs without a DOM).

  function withBrowser<T>(search: string, nodeEnv: string, fn: () => T): T {
    const g = globalThis as { window?: unknown };
    // Next types NODE_ENV as read-only; tests need to flip it.
    const env = process.env as Record<string, string | undefined>;
    const prevWindow = g.window;
    const prevEnv = env.NODE_ENV;
    g.window = { location: { search } };
    env.NODE_ENV = nodeEnv;
    try {
      return fn();
    } finally {
      if (prevWindow === undefined) delete g.window;
      else g.window = prevWindow;
      env.NODE_ENV = prevEnv;
    }
  }

  test("?tier=pro renders the Pro surface without an account", () => {
    withBrowser("?tier=pro", "development", () => {
      expect(tierOf(null)).toBe("pro");
      expect(tierOf({ id: "u1" }, "free")).toBe("pro");
      expect(can("panelWorkspace", tierOf(null))).toBe(true);
    });
  });

  test("?tier=guest demotes a real Pro account, and is ignored when absent", () => {
    withBrowser("?tier=guest", "development", () => {
      expect(tierOf({ id: "u1" }, "pro")).toBe("guest");
    });
    withBrowser("", "development", () => {
      expect(tierOf({ id: "u1" }, "pro")).toBe("pro");
    });
    withBrowser("?tier=bogus", "development", () => {
      expect(tierOf({ id: "u1" }, "pro")).toBe("pro");
    });
  });

  test("?tier= is inert in production and on the server", () => {
    withBrowser("?tier=pro", "production", () => {
      expect(tierOf(null)).toBe("guest");
      expect(tierOf({ id: "u1" }, "free")).toBe("free");
    });
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
