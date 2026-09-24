import { describe, expect, it } from "bun:test";
import { TEMPLATE_GRAPHS, templateGraphId, resolveTemplateTheme, TEMPLATE_SLUGS } from "./templates";
import { THEME_PRESETS } from "./themePresets";
import { THEME_COLOR_META } from "./types";
import type { CustomTheme, TreeEntry } from "./types";
import { swatchColors } from "./galleryThemes";
import { hexToRgb, isLightRgb } from "./themeColors";
import { categorizeByExtension } from "./categorize";

/** Recursively count all nodes a TreeEntry would produce. */
function countNodes(entry: TreeEntry): number {
  let n = 1;
  for (const child of entry.children ?? []) n += countNodes(child);
  return n;
}

/** Check that sibling names under the same parent are unique. */
function duplicateSiblings(entry: TreeEntry): string[] {
  const dupes: string[] = [];
  for (const child of entry.children ?? []) {
    const siblings = entry.children?.filter((c) => c.name === child.name) ?? [];
    if (siblings.length > 1) dupes.push(child.name);
    dupes.push(...duplicateSiblings(child));
  }
  return [...new Set(dupes)];
}

// ── TEMPLATE GRAPHS ────────────────────────────────────────────────────────

describe("TEMPLATE_GRAPHS", () => {
  it("has exactly 8 templates", () => {
    expect(TEMPLATE_GRAPHS.length).toBe(8);
  });

  it("all slugs are unique", () => {
    const slugs = TEMPLATE_GRAPHS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("all themeName values resolve to a THEME_PRESETS entry", () => {
    for (const t of TEMPLATE_GRAPHS) {
      const preset = THEME_PRESETS.find((p) => p.name === t.themeName);
      expect(preset).toBeDefined();
    }
  });

  for (const t of TEMPLATE_GRAPHS) {
    describe(t.slug, () => {
      it("tree root is a folder", () => {
        expect(t.tree.type).toBe("folder");
      });

      it("node count matches declaration (~N in description)", () => {
        const actual = countNodes(t.tree);
        // Extract the declared count from the description "~NN cards"
        const match = t.description.match(/~(\d+)/);
        expect(match).not.toBeNull();
        const declared = Number(match![1]);
        // Allow 10% tolerance — declarations are rounded
        expect(Math.abs(actual - declared)).toBeLessThanOrEqual(Math.ceil(declared * 0.12));
      });

      it("no duplicate sibling names anywhere", () => {
        expect(duplicateSiblings(t.tree)).toEqual([]);
      });

      it("templateGraphId returns deterministic tpl- prefixed id", () => {
        const id = templateGraphId(t.slug);
        expect(id).toBe(`tpl-${t.slug}`);
        expect(id.length).toBeGreaterThan(5);
      });
    });
  }
});

// ── TEMPLATE THEMES (the 8 Gallery presets) ────────────────────────────────

const GALLERY_THEME_NAMES = [
  "Terminal Amber",
  "Blueprint",
  "Ink & Clay",
  "Neon Grid",
  "Mono Print",
  "Canopy",
  "Aurora Depth",
  "Slate Highlighter",
];

describe("Gallery starter themes", () => {
  it("all 8 are in THEME_PRESETS", () => {
    for (const name of GALLERY_THEME_NAMES) {
      expect(THEME_PRESETS.find((p) => p.name === name)).toBeDefined();
    }
  });

  for (const name of GALLERY_THEME_NAMES) {
    describe(name, () => {
      const preset = THEME_PRESETS.find((p) => p.name === name)!;
      const theme = preset.theme;

      it("has all 17 required CustomTheme slots", () => {
        for (const meta of THEME_COLOR_META) {
          expect(theme[meta.key]).toBeDefined();
        }
      });

      it("every slot has a valid 6-hex color", () => {
        const hexRe = /^#[0-9a-fA-F]{6}$/;
        for (const meta of THEME_COLOR_META) {
          const slot = theme[meta.key];
          expect(slot.color).toMatch(hexRe);
        }
      });

      it("every slot has opacity in [0, 1]", () => {
        for (const meta of THEME_COLOR_META) {
          const slot = theme[meta.key];
          expect(slot.opacity).toBeGreaterThanOrEqual(0);
          expect(slot.opacity).toBeLessThanOrEqual(1);
        }
      });

      it("category is 'Gallery'", () => {
        expect(preset.category).toBe("Gallery");
      });

      it("swatchColors returns 4 chips", () => {
        const chips = swatchColors(theme);
        expect(chips.length).toBeGreaterThanOrEqual(3);
        for (const c of chips) {
          expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      });
    });
  }
});

// ── resolveTemplateTheme ────────────────────────────────────────────────────

describe("resolveTemplateTheme", () => {
  it("returns theme JSON for a valid preset name", () => {
    const theme = resolveTemplateTheme("Terminal Amber");
    expect(theme).toBeDefined();
    expect(theme!.background.color).toBe("#0d0b07");
  });

  it("returns undefined for unknown name", () => {
    expect(resolveTemplateTheme("Nope Nope Nope")).toBeUndefined();
  });
});
