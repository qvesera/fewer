import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGO_MARK_PATHS } from "./graphRenderer";
import { LOGO_DATA_URI } from "./emailTemplate";

/**
 * Brand-asset drift guard (T-173): the mark exists in several frozen forms —
 * the vector `public/logo_flat.svg`, the flattened paths the SVG exporter
 * embeds, and the base64 PNG the email template carries. Each is inline on
 * purpose (exports must work offline, emails cannot fetch), and each can go
 * stale the moment the source drawing changes. These tests are what makes
 * that duplication safe: editing the SVG without re-copying fails `bun run
 * test`, exactly like the compare-squiggle guard.
 */
const PUBLIC = join(import.meta.dir, "../../../public");
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

/** PNG header: width/height are big-endian u32s at offsets 16 and 20. */
function pngSize(name: string): { width: number; height: number } {
  const bytes = readFileSync(join(PUBLIC, name));
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("brand assets", () => {
  const svg = readFileSync(join(PUBLIC, "logo_flat.svg"), "utf8");

  test("the exported mark matches public/logo_flat.svg", () => {
    const flat = normalize(LOGO_MARK_PATHS);
    const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => normalize(m[1]));
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) expect(flat).toContain(`d="${d}"`);

    const circles = [...svg.matchAll(/<circle[^>]*>/g)].map((m) => m[0]);
    expect(circles.length).toBeGreaterThan(0);
    for (const circle of circles) {
      const cx = circle.match(/cx="([^"]+)"/)?.[1];
      const cy = circle.match(/cy="([^"]+)"/)?.[1];
      const r = circle.match(/r="([^"]+)"/)?.[1];
      expect(flat).toContain(`cx="${cx}" cy="${cy}" r="${r}"`);
    }
  });

  test("the email logo is exactly public/logo-192.png", () => {
    const png = readFileSync(join(PUBLIC, "logo-192.png"));
    expect(LOGO_DATA_URI).toBe(`data:image/png;base64,${png.toString("base64")}`);
  });

  test("the icon set is the sizes it claims", () => {
    expect(pngSize("logo-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("logo-512.png")).toEqual({ width: 512, height: 512 });
    // The app header mark and the OG card: existence plus real pixels; the
    // OG size is pinned because unfurl scrapers reject anything else.
    expect(pngSize("logo.png").width).toBeGreaterThan(0);
    expect(pngSize("og.png")).toEqual({ width: 1200, height: 630 });
  });
});
