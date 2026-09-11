import { buildBatchActions, type BatchToast } from "./batchActions";
import { buildSelectActions } from "./batchSelect";

const BATCH_TOP_IDS = new Set(["copy", "cut", "duplicate", "hide"]);

export interface BatchMenuGroup {
  top: ReturnType<typeof buildBatchActions>;
  more: ReturnType<typeof buildBatchActions>;
  select: ReturnType<typeof buildSelectActions>;
  delete: ReturnType<typeof buildBatchActions>[number] | undefined;
}

/**
 * Groups batch + select actions into a compact layout for context menus.
 * Top-level: Copy, Cut, Duplicate, Hide (most frequent).
 * "More ▸": the rest (danger excluded).
 * "Select ▸": selection expansion helpers.
 * Delete: always last, danger.
 */
export function groupBatchActions(opts: {
  toast: BatchToast;
  selectedIds: string[];
}): BatchMenuGroup {
  const all = buildBatchActions(opts);
  const select = buildSelectActions(opts.selectedIds);
  return {
    top: all.filter((a) => BATCH_TOP_IDS.has(a.id)),
    more: all.filter((a) => !BATCH_TOP_IDS.has(a.id) && !a.danger),
    select,
    delete: all.find((a) => a.danger),
  };
}