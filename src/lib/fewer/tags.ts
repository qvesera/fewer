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
 * Colors follow TAG ORDER clockwise around the ring, starting at the left:
 * the seam sits at the bottom-left corner, so reading the ring clockwise from
 * the left (up the left edge, across the top) meets the first tag, then the
 * second, and so on — first color left, next across the top, last wrapping the
 * right/bottom to the seam. This matches the TagDots row and keeps odd tag
 * counts from reading backwards (an un-reversed list starting at the top reads
 * g1 → gN, which looks anti-clockwise).
 *
 * With `dims`, stops are placed by equal OUTLINE LENGTH instead of equal angle:
 * a conic-gradient divides by angle from the center, so equal-angle wedges
 * paint visibly unequal bands on a rectangular card (worse for odd counts).
 * Falls back to equal-angle (square) stops when no dims are given (or they are
 * non-positive) — e.g. before React Flow has measured the node.
 *
 * @example
 * buildTagRingGradient(["#f00", "#00f"]) // "conic-gradient(from 225deg, #f00 0%, #f00 50%, #00f 50%, #00f 100%)"
 * buildTagRingGradient(["#f00", "#0f0", "#00f"], { width: 240, height: 120 })
 *   // "conic-gradient(from 243.43deg, #f00 0%, #f00 32.38%, #0f0 32.38%, #0f0 64.76%, #00f 64.76%, #00f 100%)"
 *   // top edge reads red → green left-to-right, blue wraps the bottom
 */
export function buildTagRingGradient(colors: string[], dims?: TagRingDims): string {
  // Display order — the FIRST tag is the ring's starting color at the left.
  const capped = colors.slice(0, TAG_RING_CAP);
  if (capped.length === 0) return "";
  if (capped.length === 1) return capped[0];

  const n = capped.length;
  const usePerimeter = !!dims && dims.width > 0 && dims.height > 0;
  const w = usePerimeter ? dims!.width : 0;
  const h = usePerimeter ? dims!.height : 0;

  // Seam = bottom-left corner (perimeter coordinate measured clockwise from
  // top-center; 225° on the square/equal-angle fallback).
  const seamPerim = usePerimeter ? 3 * (w / 2) + h : 0;
  const seamAngle = usePerimeter ? perimeterPointAngle(seamPerim, w, h) : 225;

  /** Percent offset (clockwise from the seam) to the k-th color boundary. */
  const offsetPercent = (k: number): number => {
    if (usePerimeter) {
      const perim = 2 * (w + h);
      const ang = perimeterPointAngle(seamPerim + (k * perim) / n, w, h);
      const offsetDeg = (ang - seamAngle + 360) % 360;
      return +(offsetDeg / 3.6).toFixed(2);
    }
    return +((k * 100) / n).toFixed(2);
  };

  const stops = capped.flatMap((c, i) => {
    const start = i === 0 ? 0 : offsetPercent(i);
    const end = i === n - 1 ? 100 : offsetPercent(i + 1);
    return [`${c} ${start}%`, `${c} ${end}%`];
  });
  const from = +seamAngle.toFixed(2); // 243.435… → 243.43, 225 → 225
  return `conic-gradient(from ${from}deg, ${stops.join(", ")})`;
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
