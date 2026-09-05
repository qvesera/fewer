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

/**
 * Build a stepped conic-gradient string from tag colors. Hard stops (no blend)
 * split the ring evenly: 2 colors → 50/50, 3 → 33/33/33, etc. A single color
 * yields a solid ring. Capped at TAG_RING_CAP slices for legibility.
 *
 * @example
 * buildTagRingGradient(["#f00", "#00f"]) // "conic-gradient(#f00 0% 50%, #00f 50% 100%)"
 */
export function buildTagRingGradient(colors: string[]): string {
  const capped = colors.slice(0, TAG_RING_CAP);
  if (capped.length === 0) return "";
  if (capped.length === 1) return capped[0];
  const step = 100 / capped.length;
  const stops = capped.flatMap((c, i) => {
    const start = +(i * step).toFixed(2);
    const end = +((i + 1) * step).toFixed(2);
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
