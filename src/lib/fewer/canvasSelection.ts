/**
 * Merge React Flow's latest selection snapshot into the previous store
 * selection.
 *
 * Reflects RF's box-select behavior:
 * - `base` set (a Shift+drag additive gesture is in flight): union the
 *   capture-time base ids with the freshly selected ids — additive select.
 * - `base` null: keep previous ids that the fresh snapshot still contains,
 *   then append newly selected ids in RF's report order. `selectedIds` may
 *   carry extra ids (the double-click guard) that RF's snapshot omits; those
 *   survive through the previous-ids branch.
 */
export function mergeSelection(
  prevIds: string[],
  selected: { id: string }[],
  selectedIds: Set<string>,
  base: Set<string> | null,
): string[] {
  if (base) {
    return [...new Set([...base, ...selectedIds])];
  }
  // A Set for the membership test on the PREVIOUS ids: the old
  // `selected.filter(n => !prevIds.includes(n.id))` scanned the whole previous
  // selection once per reported node, so after Select All (or a wide box
  // selection) every further selection event — including each frame of a drag —
  // was quadratic in the selection size.
  const prevSet = new Set(prevIds);
  return [
    ...prevIds.filter((id: string) => selectedIds.has(id)),
    ...selected.filter((n: { id: string }) => !prevSet.has(n.id)).map((n: { id: string }) => n.id),
  ];
}

export interface NextSelectionArgs {
  prevIds: string[];
  selected: { id: string }[];
  selectedIds: Set<string>;
  base: Set<string> | null;
  /** Ids the live drag started with, or null when no drag is running. */
  dragSelection: string[] | null;
}

/**
 * The selection the store should hold for one React Flow report.
 *
 * Mid-drag, an EMPTY report does not mean "the user deselected": the canvas
 * pushes its own node array, and until the store has this view's selection that
 * push paints the dragged cards unselected — so React Flow reports empty again,
 * and store → canvas → React Flow → store repeats until React gives up with
 * "Maximum update depth exceeded" (#281). A drag therefore keeps its selection.
 */
export function nextSelectionIds({ prevIds, selected, selectedIds, base, dragSelection }: NextSelectionArgs): string[] {
  if (dragSelection && selected.length === 0) return dragSelection;
  return mergeSelection(prevIds, selected, selectedIds, base);
}

/**
 * The id list a leaf paints (both the card stamps and the edge highlight must
 * derive it the same way — two hand-rolled copies could disagree).
 *
 * Its own entry always wins. With no entry of its own, the leaf falls back to
 * the shared `selectedNodeIds` **only while no leaf owns it** (`activeLeafId
 * === null` — a pristine session, e.g. a search jump before the first canvas
 * interaction). Otherwise the shared list belongs to another view: a leaf that
 * borrowed it painted someone else's selection, reported it back as its own,
 * and the two canvases then traded `activeLeafId` — each flip makes the other
 * view inactive, which re-pushes its edges, which makes it report again —
 * until React hit its 50-nested-update limit and tore the tree down (#285).
 *
 * NO_SELECTION is a shared constant, never a fresh `[]`: the caller memoises on
 * this array's identity, so a new one per call re-derived the node lens every
 * render and re-ran the canvas's `setRfNodes` push effect forever (#282 made
 * the same call for `collapsedFolderIds`). Read-only — every caller only reads.
 */
const NO_SELECTION: string[] = [];

export function selectionForLeaf(
  leafSelections: Record<string, string[]>,
  leafId: string | null | undefined,
  activeLeafId: string | null,
  shared: string[],
): string[] {
  if (!leafId) return shared;
  const own = leafSelections[leafId];
  if (own !== undefined) return own;
  return activeLeafId === null ? shared : NO_SELECTION;
}