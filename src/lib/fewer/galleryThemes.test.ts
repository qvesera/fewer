import { describe, expect, it } from "bun:test";
import { swatchColors, galleryDisplayTitle, galleryAuthorLine } from "./galleryThemes";
import { DEFAULT_CUSTOM_THEME } from "./types";

describe("swatchColors", () => {
  it("picks background, folder/file icon and text chips from a valid theme", () => {
    const colors = swatchColors(DEFAULT_CUSTOM_THEME);
    expect(colors.length).toBeGreaterThanOrEqual(3);
    for (const c of colors) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("drops invalid or empty chips instead of returning them", () => {
    const broken = {
      ...DEFAULT_CUSTOM_THEME,
      background: { color: "not-a-color", opacity: 1 },
      defaultText: { color: "", opacity: 1 },
    };
    const colors = swatchColors(broken);
    expect(colors.some((c) => c === "not-a-color" || c === "")).toBe(false);
  });
});

describe("galleryDisplayTitle", () => {
  it("prefers a trimmed gallery title over the theme name", () => {
    expect(galleryDisplayTitle("  Solar Reimagined  ", "Solar")).toBe("Solar Reimagined");
  });

  it("falls back to the theme name for empty/blank titles", () => {
    expect(galleryDisplayTitle("", "Solar")).toBe("Solar");
    expect(galleryDisplayTitle("   ", "Solar")).toBe("Solar");
  });
});

describe("galleryAuthorLine", () => {
  it("formats name and username together", () => {
    expect(galleryAuthorLine("Ada", "ada_dev")).toBe("Ada · @ada_dev");
  });

  it("falls back to @username when the name is missing and Anonymous when both are", () => {
    expect(galleryAuthorLine("", "ada_dev")).toBe("? · @ada_dev");
    expect(galleryAuthorLine("", "")).toBe("Anonymous");
    expect(galleryAuthorLine("Ada", "")).toBe("Ada");
  });
});