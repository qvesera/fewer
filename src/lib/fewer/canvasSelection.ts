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