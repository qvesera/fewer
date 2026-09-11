import type { FewerNode } from "./types";
import { compareSiblingsByTag } from "./tags";

/** Sort criterion for sibling nodes inside a folder / tree level. */
export type SortKey = "name" | "size" | "type" | "tag";

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
 * For `tag`, nodes are grouped by their first tag's label (see `compareSiblingsByTag`);
 * pass `tagLabelById` so the comparator can resolve tag ids to labels.
 */
/**
 * Primary comparison for `size`: unknown (0) sorts last in ascending order;
 * flip for descending so 0s still trail rather than lead. Returned value is
 * pre-inversion — the caller applies `dirMult`.
 */
function compareBySize(a: FewerNode, b: FewerNode, dir: SortDir): number {
  const sa = a.data?.size ?? UNKNOWN_SIZE;
  const sb = b.data?.size ?? UNKNOWN_SIZE;
  if (sa === UNKNOWN_SIZE && sb === UNKNOWN_SIZE) return 0;
  if (sa === UNKNOWN_SIZE) return dir === "asc" ? 1 : -1;
  if (sb === UNKNOWN_SIZE) return dir === "asc" ? -1 : 1;
  return sa - sb;
}

/**
 * Full comparator for `type`. Folders always come first regardless of
 * direction; the extension order is the only part direction inverts.
 */
function compareByType(a: FewerNode, b: FewerNode, dir: SortDir): number {
  const typeA = a.data?.type ?? "";
  const typeB = b.data?.type ?? "";
  if (typeA !== typeB) {
    if (typeA === FOLDER_TYPE) return -1;
    if (typeB === FOLDER_TYPE) return 1;
  }
  // Otherwise group by extension; ext order is the inverted-able key.
  const extA = a.data?.extension ?? "";
  const extB = b.data?.extension ?? "";
  return extA.localeCompare(extB) * (dir === "desc" ? -1 : 1);
}

/**
 * Compare two sibling nodes for sort order. The primary key honors `dir`; name
 * is always used as the stable tie-breaker (never inverted) so equal keys stay
 * deterministic. For `type`, folders always come first regardless of direction.
 * For `tag`, nodes are grouped by their first tag's label (see `compareSiblingsByTag`);
 * pass `tagLabelById` so the comparator can resolve tag ids to labels.
 */
export function compareSiblings(
  a: FewerNode,
  b: FewerNode,
  key: SortKey,
  dir: SortDir,
  tagLabelById?: (id: string) => string,
): number {
  if (key === "tag") {
    return compareSiblingsByTag(a, b, tagLabelById ?? (() => ""), dir);
  }
  const dirMult = dir === "desc" ? -1 : 1;
  const primary =
    key === "size"
      ? compareBySize(a, b, dir) * dirMult
      : key === "type"
        ? compareByType(a, b, dir)
        : labelOf(a).localeCompare(labelOf(b)) * dirMult;

  if (primary !== 0) return primary;

  // Stable name tie-break (never inverted).
  return labelOf(a).localeCompare(labelOf(b));
}
