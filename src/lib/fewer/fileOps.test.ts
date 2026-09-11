import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { nodeAbsolutePath } from "./filePaths";
import { isBrowserRenderable, DOWNLOAD_TYPES } from "./fileRender";

describe("nodeAbsolutePath", () => {
  test("returns localRootPath when nodePath equals rootPath", () => {
    expect(nodeAbsolutePath("root", "root", "/abs/root")).toBe("/abs/root");
  });

  test("slices subpath under root", () => {
    expect(nodeAbsolutePath("root/src/foo.ts", "root", "/abs/root")).toBe(
      "/abs/root/src/foo.ts",
    );
  });

  test("returns null when nodePath is outside root", () => {
    expect(nodeAbsolutePath("other/src", "root", "/abs/root")).toBeNull();
  });

      test.each([
    [undefined, "root", "/abs/root"],
    ["root", undefined, "/abs/root"],
    ["root", "root", null],
  ])("nodeAbsolutePath(%p, %p, %p) -> null", (a, b, c) => {
    expect(nodeAbsolutePath(a, b, c)).toBeNull();
  });
});

describe("isBrowserRenderable", () => {
  test("image by MIME prefix", () => {
    expect(isBrowserRenderable("x.png", "image/png")).toBe(true);
  });

  test("pdf by exact MIME", () => {
    expect(isBrowserRenderable("x.pdf", "application/pdf")).toBe(true);
  });

  test("csv is never renderable", () => {
    expect(isBrowserRenderable("x.csv", "text/csv")).toBe(false);
    expect(isBrowserRenderable("x.tsv", "text/tab-separated-values")).toBe(false);
  });

  test("unknown MIME but known extension", () => {
    expect(isBrowserRenderable("README.md")).toBe(true);
  });

  test("unknown everything", () => {
    expect(isBrowserRenderable("data.bogus")).toBe(false);
    expect(isBrowserRenderable("data.bogus", "application/x-bogus")).toBe(false);
  });

  test("mime params stripped (charset ignored)", () => {
    expect(isBrowserRenderable("x.txt", "text/plain; charset=utf-8")).toBe(true);
    expect(isBrowserRenderable("x.csv", "text/csv; charset=utf-8")).toBe(false);
  });

  test("DOWNLOAD_TYPES is non-empty (sanity)", () => {
    expect(DOWNLOAD_TYPES.size).toBeGreaterThan(0);
  });
});
