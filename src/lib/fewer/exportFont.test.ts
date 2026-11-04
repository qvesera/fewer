import { describe, expect, test } from "bun:test";
import {
  firstFamily,
  fontFamilies,
  fontFileUrl,
  inlineFontSrc,
  coversAscii,
  toBase64,
  resolveFontFaceCss,
  MAX_FONT_BYTES,
} from "./exportFont";

describe("firstFamily", () => {
  test("takes the leading family and drops its quotes", () => {
    expect(firstFamily("Geist, ui-sans-serif, system-ui")).toBe("Geist");
    expect(firstFamily("'Inter Var', sans-serif")).toBe("Inter Var");
    expect(firstFamily('"Geist Mono", monospace')).toBe("Geist Mono");
    expect(firstFamily("sans-serif")).toBe("sans-serif");
  });
  test("tolerates a blank stack", () => {
    expect(firstFamily("")).toBe("");
    expect(firstFamily("   ")).toBe("");
  });
  test("every family is a candidate, quotes dropped", () => {
    expect(fontFamilies('"Geist", "Geist Fallback", ui-sans-serif')).toEqual([
      "Geist",
      "Geist Fallback",
      "ui-sans-serif",
    ]);
    expect(fontFamilies("")).toEqual([]);
  });
});

describe("fontFileUrl", () => {
  test("reads the url out of a src descriptor", () => {
    expect(fontFileUrl('url("/_next/static/media/g.woff2") format("woff2")')).toBe(
      "/_next/static/media/g.woff2",
    );
    expect(fontFileUrl("url(_next/a.woff2) format('woff2')")).toBe("_next/a.woff2");
    expect(fontFileUrl("url( ' spaced.woff2 ' )")).toBe(" spaced.woff2 ");
  });
  test("a local()-only rule has nothing to fetch", () => {
    expect(fontFileUrl("local(Arial)")).toBeNull();
    expect(fontFileUrl("")).toBeNull();
  });
  test("falls through to the url when local() comes first", () => {
    expect(fontFileUrl("local(Helvetica), url(g.woff2) format('woff2')")).toBe("g.woff2");
  });
});

describe("inlineFontSrc", () => {
  test("rewrites the url and keeps the rest of the rule", () => {
    const rule = '@font-face{font-family:Geist;src:url("g.woff2") format("woff2");unicode-range:U+??;}';
    const out = inlineFontSrc(rule, "data:font/woff2;base64,aGk=");
    expect(out).toContain("url(data:font/woff2;base64,aGk=)");
    expect(out).not.toContain("g.woff2");
    expect(out).toContain("unicode-range:U+??;");
    expect(out).toContain("font-family:Geist");
  });
});

describe("coversAscii", () => {
  test("the latin subset (U+?? = U+0000–U+00FF) covers ASCII", () => {
    expect(coversAscii("U+??")).toBe(true);
    expect(coversAscii("U+0000-00FF")).toBe(true);
  });
  test("a single ASCII codepoint counts", () => {
    expect(coversAscii("U+0041")).toBe(true);
    expect(coversAscii("U+0020-007E")).toBe(true);
  });
  test("the exotic subsets do not", () => {
    expect(coversAscii("U+460-52F, U+1C80-1C8A, U+20B4")).toBe(false);
    expect(coversAscii("U+100-2BA, U+2BD-2C5")).toBe(false);
    expect(coversAscii("U+300-301, U+1EA0-1EF9")).toBe(false);
    expect(coversAscii("U+2000-206F")).toBe(false);
    expect(coversAscii("U+131")).toBe(false);
  });
  test("no range means the face applies everywhere", () => {
    expect(coversAscii(undefined)).toBe(true);
    expect(coversAscii("")).toBe(true);
  });
});

describe("toBase64", () => {
  test("encodes bytes the browser's btoa would", () => {
    expect(toBase64(new Uint8Array([104, 105]).buffer)).toBe("aGk=");
    expect(toBase64(new Uint8Array(0).buffer)).toBe("");
  });
  test("survives a payload larger than one chunk", () => {
    const big = new Uint8Array(0x9000).fill(65); // 'A' × 36864 → 49152 base64 chars
    expect(toBase64(big.buffer)).toHaveLength(49152);
  });
});

describe("resolveFontFaceCss", () => {
  test("fails soft to an empty block when there is no document to read", async () => {
    // In the src suite there is no DOM (component tests run preloaded with
    // happy-dom) — the export must still work, just in the fallback font.
    if (typeof document === "undefined") {
      expect(await resolveFontFaceCss("Geist, sans-serif")).toBe("");
    }
  });

  test("the size ceiling is a real number, not Infinity", () => {
    expect(MAX_FONT_BYTES).toBeGreaterThan(100_000);
    expect(MAX_FONT_BYTES).toBeLessThan(5_000_000);
  });
});
