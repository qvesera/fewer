import { describe, expect, test } from "bun:test";
import { devTierOverride } from "./devTier";

// Pure, parameterised on purpose: no ambient globals, so these pass whatever
// order bun runs the files in (the old in-`tierOf` override was order-dependent
// and only failed on CI runners).

describe("devTierOverride", () => {
  test("?tier=pro|free|guest is honoured", () => {
    expect(devTierOverride("?tier=pro")).toBe("pro");
    expect(devTierOverride("?tier=free")).toBe("free");
    expect(devTierOverride("?tier=guest")).toBe("guest");
    expect(devTierOverride("?tier=pro&foo=1")).toBe("pro");
  });

  test("absent or bogus ?tier= means derive normally", () => {
    expect(devTierOverride("")).toBeNull();
    expect(devTierOverride("?foo=1")).toBeNull();
    expect(devTierOverride("?tier=bogus")).toBeNull();
    expect(devTierOverride("?tier=")).toBeNull();
  });

  test("inert in production regardless of the query string", () => {
    // Next types NODE_ENV as read-only; the test needs to flip it.
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(devTierOverride("?tier=pro")).toBeNull();
    } finally {
      env.NODE_ENV = prev;
    }
  });

  test("a window without a location does not throw (the CI failure mode)", () => {
    // snapshot.test.ts and uiSlices.test.ts leave `globalThis.window =
    // globalThis` behind for the rest of the process — no `location` on it.
    const g = globalThis as { window?: unknown };
    const had = Object.prototype.hasOwnProperty.call(g, "window");
    const prev = g.window;
    g.window = globalThis;
    try {
      expect(devTierOverride()).toBeNull();
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });
});