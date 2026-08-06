import { test, expect } from "bun:test";
import {
  hexToRgb,
  clampOpacity,
  toCssColor,
  migrateCustomTheme,
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