import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { A11Y_CLASS_MAP, A11Y_DEFAULTS, a11yClassList, normalizeA11y } from "./a11ySettings";

// The DOM half of a11ySettings (applyA11yToDom) is exercised end-to-end in
// e2e/typefloor.spec.ts — `bun test src` has no DOM registered.

describe("a11y settings", () => {
  it("maps exactly the five html-class flags, in declaration order", () => {
    expect(Object.keys(A11Y_CLASS_MAP)).toEqual([
      "highContrast",
      "solidSurfaces",
      "reduceMotion",
      "largeTargets",
      "strongFocus",
    ]);
    // The two tag-painting flags are deliberately NOT classes: they change how
    // tags are drawn, not how <html> is styled.
    expect(Object.keys(A11Y_DEFAULTS)).toHaveLength(7);
  });

  it("turns flags into classes and leaves the paint flags out", () => {
    expect(a11yClassList(A11Y_DEFAULTS)).toEqual([]);
    expect(a11yClassList({ ...A11Y_DEFAULTS, highContrast: true, colorBlindSafe: true })).toEqual(["a11y-contrast"]);
    expect(
      a11yClassList({ ...A11Y_DEFAULTS, largeTargets: true, strongFocus: true, tagInitials: true }),
    ).toEqual(["a11y-targets", "a11y-focus"]);
  });

  it("normalises anything unpersistable to the defaults", () => {
    expect(normalizeA11y(undefined)).toEqual(A11Y_DEFAULTS);
    expect(normalizeA11y(null)).toEqual(A11Y_DEFAULTS);
    expect(normalizeA11y("yes")).toEqual(A11Y_DEFAULTS);
    expect(normalizeA11y({ highContrast: "yes", reduceMotion: 1 })).toEqual(A11Y_DEFAULTS);
    expect(normalizeA11y({ highContrast: true })).toEqual({ ...A11Y_DEFAULTS, highContrast: true });
    expect(normalizeA11y({ ...A11Y_DEFAULTS, tagInitials: true, bogus: true })).toEqual({
      ...A11Y_DEFAULTS,
      tagInitials: true,
    });
  });

  it("the pre-paint init script in layout.tsx writes the same class names", () => {
    // The inline script cannot import this module, so the names are duplicated
    // there on purpose — this pins them together.
    const src = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
    for (const cls of Object.values(A11Y_CLASS_MAP)) {
      expect(src).toContain(`'${cls}'`);
    }
  });
});
