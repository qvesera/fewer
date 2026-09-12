import type { FewerNode } from "./types";

/** A reusable label+color marker that can be assigned to any number of nodes. */
export interface Tag {
  id: string;
  label: string;
  /** Hex color (e.g. "#f87171"). Used for the assignment dot + the card ring. */
  color: string;
}

/** Vibrant, theme-agnostic palette assigned to new tags in order. */
export const TAG_PALETTE: string[] = [
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // amber
  "#a3e635", // lime
  "#34d399", // emerald
  "#22d3ee", // cyan
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
];

/** Distinct fallback color for tags whose id isn't in the registry (shared graphs). */
export const TAG_FALLBACK_COLOR = "#94a3b8";

/** Tag colors shown on a ring — anything beyond this is counted as "+N" overflow. */
export const TAG_RING_CAP = 5;

/** Card dimensions used to split the ring equally by outline length. */
export interface TagRingDims {
  /** Rendered card width in px. */
  width: number;
  /** Rendered card height in px. */
  height: number;
}

/** Conic angle (degrees, clockwise from 12 o'clock) of a point on the rectangle
 * outline at perimeter coordinate `s` (measured clockwise from top-center). */
function perimeterPointAngle(s: number, w: number, h: number): number {
  const hw = w / 2;
  const hh = h / 2;
  const perim = 2 * (w + h);
  const t = ((s % perim) + perim) % perim;
  let x: number;
  let y: number;
  if (t < hw) { x = t; y = -hh; }                          // top edge, center → right corner
  else if (t < hw + h) { x = hw; y = -hh + (t - hw); }     // right edge, top → bottom
  else if (t < 3 * hw + h) { x = hw - (t - hw - h); y = hh; } // bottom edge, right → left
  else if (t < 3 * hw + 2 * h) { x = -hw; y = hh - (t - 3 * hw - h); } // left edge, bottom → top
  else { x = -hw + (t - 3 * hw - 2 * h); y = -hh; }         // top edge, left corner → center
  // CSS conic-gradient: 0° at 12 o'clock, angles increase clockwise.
  return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
}

/**
 * Build a stepped conic-gradient string from tag colors. Hard stops (no blend)
 * split the ring evenly: 2 colors → 50/50, 3 → 33/33/33, etc. A single color
 * yields a solid ring. Capped at TAG_RING_CAP slices for legibility.
 *
 * Colors are laid out so the FIRST color starts on the LEFT side of the ring,
 * matching left-to-right reading order and the TagDots row on the card
 * (green, pink → green left, pink right). This requires reversing the list:
 * a CSS conic-gradient starts at 12 o'clock and runs clockwise, so an
 * un-reversed list would put the first color on the RIGHT instead.
 *
 * With `dims`, stops are placed by equal OUTLINE LENGTH instead of equal angle.
 * A conic-gradient divides by angle from center, so on a rectangular card an
 * odd number of equal-angle wedges paints visibly unequal bands (the middle
 * color is short on a 2:1 card). Perimeter stops keep every color's band the
 * same length around the ring, regardless of aspect ratio. Falls back to
 * equal-angle stops when no dims are given (or they are non-positive).
 *
 * @example
 * buildTagRingGradient(["#f00", "#00f"]) // "conic-gradient(#00f 0% 50%, #f00 50% 100%)"
 * buildTagRingGradient(["#f00", "#0f0", "#00f"], { width: 240, height: 120 })
 *   // "conic-gradient(#00f 0%, #00f 32.38%, #0f0 32.38%, #0f0 67.62%, #f00 67.62%, #f00 100%)"
 *   // boundaries land on the bottom-left/bottom-right corners → equal thirds
 */
export function buildTagRingGradient(colors: string[], dims?: TagRingDims): string {
  // Cap keeps the first DISPLAY-order tags, then reverses for ring geometry.
  const capped = [...colors].slice(0, TAG_RING_CAP).reverse();
  if (capped.length === 0) return "";
  if (capped.length === 1) return capped[0];

  const n = capped.length;
  const usePerimeter = !!dims && dims.width > 0 && dims.height > 0;
  const perim = usePerimeter ? 2 * (dims!.width + dims!.height) : 0;

  const extent = (i: number): [number, number] => {
    if (!usePerimeter) {
      const step = 100 / n;
      return [+(i * step).toFixed(2), +((i + 1) * step).toFixed(2)];
    }
    const a = (perimeterPointAngle((i * perim) / n, dims!.width, dims!.height) / 360) * 100;
    let b = (perimeterPointAngle(((i + 1) * perim) / n, dims!.width, dims!.height) / 360) * 100;
    // The final boundary wraps to 0° (same seam as 100%) — render it as 100%
    // so the last color's end stop is canonical instead of "0%".
    if (i === n - 1) b = 100;
    return [+a.toFixed(2), +b.toFixed(2)];
  };

  const stops = capped.flatMap((c, i) => {
    const [start, end] = extent(i);
    return [`${c} ${start}%`, `${c} ${end}%`];
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/**
 * First tag id on a node (stable ordering), or null when untagged. Drives both
 * the ring and tag-based sort.
 */
export function firstTagId(node: FewerNode): string | null {
  const ids = node.data.tagIds;
  return Array.isArray(ids) && ids.length > 0 ? ids[0] : null;
}

/** Build a tagId → label lookup from a tag registry, for tag-based layout sort. */
export function makeTagLabelLookup(tags: Tag[]): (id: string) => string {
  const map = new Map(tags.map((t) => [t.id, t.label]));
  return (id: string) => map.get(id) ?? "";
}

/** Resolve a tag's color from the registry, falling back to a neutral color. */
export function colorForTag(tags: Tag[], id: string): string {
  const found = tags.find((t) => t.id === id);
  return found ? found.color : TAG_FALLBACK_COLOR;
}

/**
 * Sort siblings by the alphabetical label of their first tag. Tagged nodes come
 * first (asc) or last (desc) as a group, ordered within the group by tag label;
 * untagged nodes always trail. Name is the stable tie-break (never inverted).
 */
export function compareSiblingsByTag(
  a: FewerNode,
  b: FewerNode,
  /** tagId → label lookup, sourced from the registry. */
  labelOf: (id: string) => string,
  dir: "asc" | "desc",
): number {
  const dirMult = dir === "desc" ? -1 : 1;
  const idA = firstTagId(a);
  const idB = firstTagId(b);

  const aTagged = idA !== null;
  const bTagged = idB !== null;
  if (aTagged !== bTagged) {
    // Tagged first in asc; flip so tagged trail in desc.
    const taggedFirst = -1 * dirMult;
    return aTagged ? taggedFirst : -taggedFirst;
  }
  if (idA && idB && idA !== idB) {
    const primary = labelOf(idA).localeCompare(labelOf(idB));
    if (primary !== 0) return primary * dirMult;
  }
  // Stable name tie-break (never inverted).
  return (a.data.label).localeCompare(b.data.label);
}
