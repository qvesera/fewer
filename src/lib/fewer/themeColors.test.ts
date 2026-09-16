import { describe, test, expect } from "bun:test";
import {
  hexToRgb,
  clampOpacity,
  toCssColor,
  migrateCustomTheme,
  toGradientCss,
  toCssValue,
  clampAngle,
  mixHex,
  suggestGradientEnd,
  canvasChipStyle,
  luma,
  lumaHex,
  isLightRgb,
  deriveShadcnVars,
  computePrimaryFgFinal,
  PRIMARY_FG_LUMA_THRESHOLD,
} from "./themeColors";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "./types";
import type { CustomTheme, CustomThemeColor } from "./types";

test("hexToRgb parses valid hex", () => {
  expect(hexToRgb("#fd7e14")).toEqual({ r: 253, g: 126, b: 20 });
  expect(hexToRgb("ffa94d")).toEqual({ r: 255, g: 169, b: 77 });
});

test("hexToRgb rejects invalid input", () => {
  expect(hexToRgb("#fff")).toBeNull();
  expect(hexToRgb("notacolor")).toBeNull();
  expect(hexToRgb("")).toBeNull();
});

test("clampOpacity clamps to [0,1] with 2 decimals", () => {
  expect(clampOpacity(1.5)).toBe(1);
  expect(clampOpacity(-1)).toBe(0);
  expect(clampOpacity(0.123)).toBe(0.12);
  expect(clampOpacity(NaN)).toBe(1);
});

test("toCssColor returns hex at full opacity", () => {
  expect(toCssColor("#fd7e14", 1)).toBe("#fd7e14");
});

test("toCssColor returns rgba at partial opacity", () => {
  expect(toCssColor("#fd7e14", 0.5)).toBe("rgba(253, 126, 20, 0.5)");
  expect(toCssColor("#ffffff", 0)).toBe("rgba(255, 255, 255, 0)");
});

test("migrateCustomTheme fills defaults for empty input", () => {
  const migrated = migrateCustomTheme(null);
  for (const meta of THEME_COLOR_META) {
    expect(migrated[meta.key]).toEqual(DEFAULT_CUSTOM_THEME[meta.key]);
  }
});

test("migrateCustomTheme converts legacy plain-string theme", () => {
  const legacy = {
    background: "#0b0b13",
    defaultText: "rgba(248, 249, 250, 0.8)",
  };
  const migrated = migrateCustomTheme(legacy);
  expect(migrated.background).toEqual({ color: "#0b0b13", opacity: 1 });
  expect(migrated.defaultText).toEqual({ color: "#f8f9fa", opacity: 0.8 });
});

test("migrateCustomTheme respects structured overrides", () => {
  const themed = migrateCustomTheme({
    folderBg: { color: "#ffa94d", opacity: 0.3 },
  });
  expect(themed.folderBg).toEqual({ color: "#ffa94d", opacity: 0.3 });
});

// ---------- gradient helpers ----------

test("clampAngle clamps to [0,360] as whole numbers", () => {
  expect(clampAngle(135)).toBe(135);
  expect(clampAngle(400)).toBe(360);
  expect(clampAngle(-10)).toBe(0);
  expect(clampAngle(NaN)).toBe(135);
  expect(clampAngle(137.6)).toBe(138);
});

test("toGradientCss returns null when no valid gradientTo", () => {
  expect(toGradientCss({ color: "#fd7e14", opacity: 0.5 })).toBeNull();
  expect(toGradientCss({ color: "#fd7e14", opacity: 0.5, gradientTo: null })).toBeNull();
  expect(toGradientCss({ color: "#fd7e14", opacity: 0.5, gradientTo: "nope" })).toBeNull();
});

test("toGradientCss builds linear-gradient with default angle + per-stop opacity", () => {
  expect(toGradientCss({ color: "#fd7e14", opacity: 0.5, gradientTo: "#be4bdb", gradientAngle: 90 })).toBe(
    "linear-gradient(90deg, rgba(253, 126, 20, 0.5), rgba(190, 75, 219, 0.5))",
  );
  // Full opacity returns hex stops; no explicit angle -> 135.
  expect(toGradientCss({ color: "#fd7e14", opacity: 1, gradientTo: "#be4bdb" })).toBe(
    "linear-gradient(135deg, #fd7e14, #be4bdb)",
  );
});

test("toCssValue returns gradient when configured, solid otherwise", () => {
  expect(toCssValue({ color: "#fd7e14", opacity: 1, gradientTo: "#be4bdb", gradientAngle: 45 })).toBe(
    "linear-gradient(45deg, #fd7e14, #be4bdb)",
  );
  expect(toCssValue({ color: "#fd7e14", opacity: 1 })).toBe("#fd7e14");
});

test("mixHex interpolates between two hex colors", () => {
  expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
  expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
});

test("suggestGradientEnd returns a darker endpoint for light colors and lighter for dark", () => {
  const lightLuma = lumaHex(suggestGradientEnd("#ffffff"));
  const darkLuma = lumaHex(suggestGradientEnd("#000000"));
  expect(lightLuma).not.toBeNull();
  expect(darkLuma).not.toBeNull();
  expect(lightLuma!).toBeLessThan(128);
  expect(darkLuma!).toBeGreaterThan(128);
});

test("migrateCustomTheme preserves valid gradient fields", () => {
  const migrated = migrateCustomTheme({
    folderBg: { color: "#fd7e14", opacity: 0.3, gradientTo: "#be4bdb", gradientAngle: 45 },
  });
  expect(migrated.folderBg.gradientTo).toBe("#be4bdb");
  expect(migrated.folderBg.gradientAngle).toBe(45);

  // Invalid gradientTo is dropped
  const invalid = migrateCustomTheme({ folderBg: { color: "#fd7e14", opacity: 0.3, gradientTo: "nope" } });
  expect(invalid.folderBg.gradientTo).toBeUndefined();
});

test("gradient-capable slots carry gradientCssVar in THEME_COLOR_META", () => {
  const withGrad = THEME_COLOR_META.filter((m) => m.gradientCssVar).map((m) => m.key);
  expect(withGrad).toEqual(["background", "folderBg", "fileBg"]);
});

describe("canvasChipStyle", () => {
  test("light background gets a darkened chip with light text", () => {
    expect(canvasChipStyle("#ffffff")).toEqual({
      backgroundColor: "rgba(64, 64, 64, 0.8)",
      color: "rgba(255, 255, 255, 0.9)",
    });
  });

  test("dark background gets a lightened chip with dark text", () => {
    expect(canvasChipStyle("#0b0b13")).toEqual({
            backgroundColor: "rgba(134, 134, 138, 0.8)",
      color: "rgba(0, 0, 0, 0.85)",
    });
  });

  test("undefined/empty falls back to the dark default; non-hex returns {}", () => {
        expect(canvasChipStyle(undefined)).toEqual(canvasChipStyle("#0b0b13"));
    expect(canvasChipStyle("  rgb(1,2,3) ")).toEqual({});
  });
});

describe("luma / light-dark primitives", () => {
  test("luma is the BT.601 weighted sum on the 0-255 scale", () => {
    expect(luma({ r: 255, g: 255, b: 255 })).toBe(255);
    expect(luma({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luma({ r: 255, g: 0, b: 0 })).toBeCloseTo(76.245, 10);
  });

  test("luma is exact at integer greys, so thresholds cannot straddle", () => {
    // The old `r * 0.299 + g * 0.587 + b * 0.114` form returned 127.99999999999999
    // for #808080 — just under an integer threshold. The shared form is exact.
    for (const v of [127, 128, 129, 139, 140, 141, 255]) {
      expect(luma({ r: v, g: v, b: v })).toBe(v);
    }
  });

  test("lumaHex parses hex with or without #, and nulls when invalid", () => {
    expect(lumaHex("#808080")).toBe(128);
    expect(lumaHex("808080")).toBe(128);
    expect(lumaHex("#ffffff")).toBe(255);
    expect(lumaHex("rgb(1,2,3)")).toBeNull();
    expect(lumaHex("nope")).toBeNull();
  });

  test("isLightRgb uses the 128 midpoint, strictly greater", () => {
    expect(isLightRgb({ r: 128, g: 128, b: 128 })).toBe(false);
    expect(isLightRgb({ r: 129, g: 129, b: 129 })).toBe(true);
    expect(isLightRgb({ r: 255, g: 255, b: 255 })).toBe(true);
    expect(isLightRgb({ r: 0, g: 0, b: 0 })).toBe(false);
  });

  test("the 140 primary-foreground cutoff stays distinct from the 128 surface midpoint", () => {
    // Guards the two thresholds against being accidentally merged: a luma-135
    // accent is "light" for surfaces, but must still take white primary text.
    expect(isLightRgb({ r: 135, g: 135, b: 135 })).toBe(true);
    expect(luma({ r: 135, g: 135, b: 135 }) > 140).toBe(false);
  });
});

/** A theme color slot at the given opacity (defaults to fully opaque). */
const slot = (color: string, opacity = 1): CustomThemeColor => ({ color, opacity });

/** Build a theme off the default, overriding only the slots a test cares about. */
const themeWith = (overrides: Partial<CustomTheme>): CustomTheme => ({
  ...DEFAULT_CUSTOM_THEME,
  ...overrides,
});

/** Look up one derived shadcn variable by name. */
const varOf = (vars: [string, string][], name: string): string | undefined =>
  vars.find(([key]) => key === name)?.[1];

describe("deriveShadcnVars", () => {
  test("emits the full shadcn var set exactly once, in order", () => {
    const names = deriveShadcnVars(DEFAULT_CUSTOM_THEME).map(([key]) => key);
    expect(names).toEqual([
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--border",
      "--input",
      "--ring",
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-border",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  test("dark background darkens card and muted, and tints borders white", () => {
    const vars = deriveShadcnVars(themeWith({ background: slot("#0b0b13") }));
    expect(varOf(vars, "--card")).toBe("#03030b"); // 11-8, 11-8, 19-8
    expect(varOf(vars, "--muted")).toBe("#000004"); // r/g clamp at 0, 19-15
    expect(varOf(vars, "--sidebar")).toBe("#03030b");
    expect(varOf(vars, "--border")).toBe("rgba(255, 255, 255, 0.08)");
    expect(varOf(vars, "--input")).toBe("rgba(255, 255, 255, 0.05)");
  });

  test("light background lightens card and muted, and tints borders dark", () => {
    const vars = deriveShadcnVars(themeWith({ background: slot("#ffffff") }));
    expect(varOf(vars, "--card")).toBe("#ffffff"); // 255+8 clamps back to 255
    expect(varOf(vars, "--muted")).toBe("#ffffff");
    expect(varOf(vars, "--border")).toBe("rgba(26, 26, 26, 0.2)"); // round(255 * 0.1)
    expect(varOf(vars, "--input")).toBe("rgba(26, 26, 26, 0.12)");
  });

  test("primary-foreground reads the accent slot, flipping only above luma 140", () => {
    const fgFor = (accent: string) =>
      varOf(deriveShadcnVars(themeWith({ folderIcon: slot(accent) })), "--primary-foreground");
    expect(fgFor("#ffffff")).toBe("#000000"); // 255
    expect(fgFor("#8d8d8d")).toBe("#000000"); // 141 — just over the cutoff
    expect(fgFor("#8c8c8c")).toBe("#ffffff"); // 140 — the cutoff itself keeps white
    expect(fgFor("#6b7280")).toBe("#ffffff"); // 113.5 — mid-tone stays white
    expect(fgFor("not-a-color")).toBe("#ffffff"); // unparseable reads as black
  });

  test("computePrimaryFgFinal pins the 140 cutoff", () => {
    expect(PRIMARY_FG_LUMA_THRESHOLD).toBe(140);
    expect(computePrimaryFgFinal("#8d8d8d")).toBe("#000000");
    expect(computePrimaryFgFinal("#8c8c8c")).toBe("#ffffff");
  });

  test("opacity-carrying slots pass through toCssColor", () => {
    const vars = deriveShadcnVars(
      themeWith({
        background: slot("#0b0b13", 1),
        folderIcon: slot("#fd7e14", 1),
        subtleText: slot("#adb5bd", 1),
      }),
    );
    expect(varOf(vars, "--background")).toBe("#0b0b13");
    expect(varOf(vars, "--primary")).toBe("#fd7e14"); // accent at full opacity
    expect(varOf(vars, "--accent")).toBe("rgba(253, 126, 20, 0.15)");
    expect(varOf(vars, "--muted-foreground")).toBe("#adb5bd");
  });

  test("unparseable background keeps the legacy black-rgb / light-polarity quirk", () => {
    // Polarity falls back to light, so components lighten away from 0 (the old
    // `|| 0` rgb fallback) rather than darkening toward it.
    const vars = deriveShadcnVars(themeWith({ background: slot("not-a-color") }));
    expect(varOf(vars, "--card")).toBe("#080808");
    expect(varOf(vars, "--muted")).toBe("#0f0f0f");
    expect(varOf(vars, "--border")).toBe("rgba(0, 0, 0, 0.2)");
  });
});