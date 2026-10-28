import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SQUIGGLE_HEAD_PATH,
  SQUIGGLE_LOOP_PATH,
  SQUIGGLE_TRANSFORM,
  SQUIGGLE_VIEW_BOX,
} from "./compareSquiggle";
import { CompareAnnotation } from "./FeaturePlayground";

/**
 * Drift guard: the page inlines the squiggle's geometry (an <img> cannot be
 * animated stroke-by-stroke), so `public/squiggle.svg` and the constants have
 * two copies of the same strings. This test is the reason that duplication is
 * safe - editing either side alone fails here rather than shipping a stale
 * copy of the reader's drawing.
 */
describe("compare squiggle", () => {
  const asset = readFileSync(join(import.meta.dir, "../../../public/squiggle.svg"), "utf8");
  const svg = asset.replace(/\s+/g, " ");

  const fileViewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  const fileTransform = svg.match(/transform="([^"]+)"/)?.[1];
  const filePaths = [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);

  test("asset parses to a frame and two paths", () => {
    expect(fileViewBox).toBeDefined();
    expect(fileTransform).toBeDefined();
    expect(filePaths).toHaveLength(2);
  });

  test("constants match public/squiggle.svg verbatim", () => {
    expect(fileViewBox).toBe(SQUIGGLE_VIEW_BOX);
    expect(fileTransform).toBe(SQUIGGLE_TRANSFORM);
    expect(filePaths[0]).toBe(SQUIGGLE_LOOP_PATH);
    expect(filePaths[1]).toBe(SQUIGGLE_HEAD_PATH);
  });

  test("the annotation renders the asset geometry, not a stale copy", () => {
    const source = readFileSync(
      join(import.meta.dir, "FeaturePlayground.tsx"),
      "utf8",
    );
    // The component must reach for the constants; a literal `d="..."` here is
    // how the copy went stale the first time.
    expect(source).toContain("SQUIGGLE_LOOP_PATH");
    expect(source).toContain("SQUIGGLE_HEAD_PATH");
    expect(source).toContain("SQUIGGLE_VIEW_BOX");
    expect(source).toContain("SQUIGGLE_TRANSFORM");
    expect(source).not.toMatch(/\sd="M 1/);
  });

  test("CompareAnnotation stays in the module graph", () => {
    expect(typeof CompareAnnotation).toBe("function");
  });
});
