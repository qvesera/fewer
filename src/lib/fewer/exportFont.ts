/**
 * T-221: an SVG loaded in an `<img>` — which is how `exportPNG` rasterizes the
 * scene — may only use fonts declared *inside* the document. It can never fetch
 * the app's own woff2, so exported text silently fell back to a system sans
 * while the canvas rendered Geist.
 *
 * These helpers inline the app's matching `@font-face` rules (fetched from the
 * same origin, rewritten to base64 data URIs) into the scene. That makes the
 * raster match the canvas, and the downloaded `.svg` open with the right font
 * anywhere, offline — which is the same promise the brand mark already makes.
 *
 * Everything that can be reasoned about without a browser is pure and exported
 * for `exportFont.test.ts`. The browser half fails soft: any error returns `""`
 * and the export continues in the fallback font, exactly as before.
 */

/** First family of a computed `font-family` stack: `Geist, ui-sans-serif` → `Geist`. */
export function firstFamily(fontStack: string): string {
  return fontFamilies(fontStack)[0] ?? "";
}

/** Every family in a computed stack, quotes dropped — the candidates a rule may match. */
export function fontFamilies(fontStack: string): string[] {
  return fontStack
    .split(",")
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

/** First `url(...)` in a `src:` descriptor, or `null` for a `local()`-only rule. */
export function fontFileUrl(src: string): string | null {
  const match = /url\(\s*(['"]?)([^'")]+)\1\s*\)/.exec(src);
  return match ? match[2] : null;
}

/** Point a `@font-face`'s src at a data URI, leaving the rest of the rule alone. */
export function inlineFontSrc(cssText: string, dataUri: string): string {
  return cssText.replace(/url\(\s*(['"]?)[^'")]+\1\s*\)/, `url(${dataUri})`);
}

/**
 * Does this `unicode-range` cover printable ASCII (U+0020–U+007E)? next/font
 * writes `U+??` for its latin subset, i.e. U+0000–U+00FF, so the wildcard form
 * has to count. No range at all means the rule applies everywhere.
 */
export function coversAscii(unicodeRange: string | undefined): boolean {
  if (!unicodeRange) return true;
  for (const raw of unicodeRange.split(",")) {
    const token = raw.trim().replace(/^u\+/i, "");
    if (!token) continue;
    if (token.includes("?")) {
      const low = Number.parseInt(token.replace(/\?/g, "0"), 16);
      const high = Number.parseInt(token.replace(/\?/g, "F"), 16);
      if (Number.isFinite(low) && Number.isFinite(high) && high >= 0x20 && low <= 0x7e) return true;
      continue;
    }
    const [loRaw, hiRaw] = token.split("-");
    const low = Number.parseInt(loRaw, 16);
    const high = Number.parseInt(hiRaw ?? loRaw, 16);
    if (Number.isFinite(low) && Number.isFinite(high) && high >= 0x20 && low <= 0x7e) return true;
  }
  return false;
}

/** ArrayBuffer → base64, chunked so a 30KB font does not blow the call stack. */
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Safety ceiling on the inlined font payload, counted in raw bytes before
 * base64 (×~1.37). Geist's five subsets are ~76KB today; the cap exists so a
 * future font with a hundred subsets cannot make every export huge. ASCII
 * subsets are loaded first, so if the cap bites it bites the exotic ones.
 */
export const MAX_FONT_BYTES = 512_000;

interface FaceCandidate {
  cssText: string;
  url: string;
  baseUrl: string;
  ascii: boolean;
}

function collectFaces(candidates: Set<string>): FaceCandidate[] {
  const found: FaceCandidate[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet: no access, no font
    }
    if (!rules) continue;
    const baseUrl = sheet.href ?? (typeof location !== "undefined" ? location.href : "");
    for (const rule of Array.from(rules)) {
      const cssText = rule.cssText ?? "";
      if (!cssText.startsWith("@font-face")) continue;
      const style = (rule as CSSStyleRule).style;
      if (!style) continue;
      const faceFamily = firstFamily(style.getPropertyValue("font-family")).toLowerCase();
      if (!candidates.has(faceFamily)) continue;
      const src = style.getPropertyValue("src");
      const url = fontFileUrl(src);
      if (!url) continue; // `local()` only — nothing to fetch
      found.push({
        cssText,
        url,
        baseUrl,
        ascii: coversAscii(style.getPropertyValue("unicode-range") || undefined),
      });
    }
  }
  return found;
}

/**
 * `<style>` block with every matching `@font-face` inlined as a data URI, or
 * `""` when the font cannot be found/fetched (offline, no rule, CORS). The
 * block is CDATA-wrapped so it stays well-formed XML inside the scene.
 *
 * Candidates are the *whole* stack the scene will name — the SVG text uses
 * exactly this `font-family`, so the rules worth inlining are the ones that
 * stack can actually resolve to.
 */
export async function resolveFontFaceCss(fontStack: string): Promise<string> {
  const candidates = new Set(fontFamilies(fontStack).map((f) => f.toLowerCase()));
  if (!candidates.size || typeof document === "undefined") return "";

  let faces: FaceCandidate[];
  try {
    faces = collectFaces(candidates);
  } catch {
    return "";
  }
  if (!faces.length) return "";
  faces = [...faces].sort((a, b) => Number(b.ascii) - Number(a.ascii));

  const inlined: string[] = [];
  let rawBytes = 0;
  for (const face of faces) {
    try {
      const href = new URL(face.url, face.baseUrl || undefined).toString();
      const response = await fetch(href);
      if (!response.ok) break;
      const buffer = await response.arrayBuffer();
      rawBytes += buffer.byteLength;
      if (rawBytes > MAX_FONT_BYTES) continue;
      inlined.push(inlineFontSrc(face.cssText, `data:font/woff2;base64,${toBase64(buffer)}`));
    } catch {
      break; // offline or blocked: keep what we already have
    }
  }
  if (!inlined.length) return "";
  return `<style type="text/css"><![CDATA[\n${inlined.join("\n")}\n]]></style>`;
}
