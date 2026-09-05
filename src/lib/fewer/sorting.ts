import type { FewerNode } from "./types";

/** Sort criterion for sibling nodes inside a folder / tree level. */
export type SortKey = "name" | "size" | "type";

/** Sort direction applied to the primary sort key. */
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT_KEY: SortKey = "name";
export const DEFAULT_SORT_DIR: SortDir = "asc";

const FOLDER_TYPE = "folder";

// ponytail: size rollup is unknown for many sources (crawled dirs, snapshots),
// so a folder/file reporting size 0 is treated as "unknown" and sorted last in
// ascending order. Upgrade path: compute recursive subtree totals when the
// source provides file sizes.
const UNKNOWN_SIZE = 0;

/** Compare the label (name) of two nodes, falling back to id on a miss. */
function labelOf(n: FewerNode): string {
  return (n.data?.label as string) ?? n.id;
}

/**
 * Compare two sibling nodes for sort order. The primary key honors `dir`; name
 * is always used as the stable tie-breaker (never inverted) so equal keys stay
 * deterministic. For `type`, folders always come first regardless of direction.
 */
export function compareSiblings(a: FewerNode, b: FewerNode, key: SortKey, dir: SortDir): number {
  const dirMult = dir === "desc" ? -1 : 1;

  let primary = 0;
  switch (key) {
    case "size": {
      const sa = a.data?.size ?? UNKNOWN_SIZE;
      const sb = b.data?.size ?? UNKNOWN_SIZE;
      // Unknown (0) sorts last in ascending order; flip for descending so 0s
      // still trail rather than lead.
      const unknownLast = dir === "asc";
      if (sa === UNKNOWN_SIZE && sb === UNKNOWN_SIZE) primary = 0;
      else if (sa === UNKNOWN_SIZE) primary = unknownLast ? 1 : -1;
      else if (sb === UNKNOWN_SIZE) primary = unknownLast ? -1 : 1;
      else primary = sa - sb;
      break;
    }
    case "type": {
      const typeA = a.data?.type ?? "";
      const typeB = b.data?.type ?? "";
      // Folders first, always (independent of direction).
      const aIsFolder = typeA === FOLDER_TYPE;
      const bIsFolder = typeB === FOLDER_TYPE;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      // Otherwise group by extension; ext order is the inverted-able key.
      const extA = a.data?.extension ?? "";
      const extB = b.data?.extension ?? "";
      primary = extA.localeCompare(extB);
      break;
    }
    case "name":
    default:
      primary = labelOf(a).localeCompare(labelOf(b));
      break;
  }

  primary *= dirMult;
  if (primary !== 0) return primary;

  // Stable name tie-break (never inverted).
  return labelOf(a).localeCompare(labelOf(b));
}
