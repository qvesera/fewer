import { test, expect } from "bun:test";
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
} from "./themeColors";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "./types";

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
  const light = suggestGradientEnd("#ffffff");
  const luminanceLight = hexToRgb(light);
  expect(luminanceLight ? (luminanceLight.r * 299 + luminanceLight.g * 587 + luminanceLight.b * 114) / 1000 : 0).toBeLessThan(128);

  const dark = suggestGradientEnd("#000000");
  const luminanceDark = hexToRgb(dark);
  expect(luminanceDark ? (luminanceDark.r * 299 + luminanceDark.g * 587 + luminanceDark.b * 114) / 1000 : 0).toBeGreaterThan(128);
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