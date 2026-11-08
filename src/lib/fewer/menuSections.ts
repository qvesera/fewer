import { buildBatchActions, type BatchAction, type BatchToast } from "./batchActions";
import { buildSelectActions, type SelectAction } from "./batchSelect";

/**
 * Which cluster a batch action belongs to, and the order it reads in. The sets
 * are exhaustive by test: every action `buildBatchActions` returns lands in
 * exactly one bucket (plus `delete`), so a new action cannot silently fall
 * into a junk drawer or disappear from the menu.
 */
const EDIT = [
  "rename",
  "copy",
  "cut",
  "duplicate",
  // Shell-only (the desktop build adds Copy Paths to the same list); absent
  // in the web build, so listing it here is a no-op — but it must be listed, or
  // a foreign id falls outside every bucket and vanishes from the menu.
  "copy-paths",
] as const;
const STRUCTURE = ["move-to-folder", "unparent", "group"] as const;
const VISIBILITY = ["hide", "show", "collapse", "expand"] as const;

const EDIT_IDS = new Set<string>(EDIT);
const STRUCTURE_IDS = new Set<string>(STRUCTURE);
const VISIBILITY_IDS = new Set<string>(VISIBILITY);

export interface BatchMenuGroup {
  /** Rename…, Copy, Cut, Duplicate — act on the cards as data. */
  edit: BatchAction[];
  /** Reparenting + grouping: Move to Folder…, Unparent, Group N Items. */
  structure: BatchAction[];
  /** Visibility only: Hide, Show, Collapse Folders, Expand Folders. */
  visibility: BatchAction[];
  select: SelectAction[];
  delete: BatchAction | undefined;
}

/**
 * Groups batch + select actions for the multi-selection menu — the card
 * menu's batch section and the canvas selection menu, which must read as the
 * same menu (T-246 rework).
 *
 * The old split was `top` (copy/cut/duplicate/hide) + `more`, and `more`
 * turned into a junk drawer: Rename… and Move to Folder… hid behind it while
 * Hide sat top-level with its partner Show buried in the submenu, and the
 * structure trio (Move / Unparent / Group) sat two levels deep. The groups
 * below mirror the card menu's own order — Edit → Structure → View/Meta →
 * Danger — so one menu's shape predicts the other's.
 *
 * `delete` is pulled out separately so the renderer can always put it last,
 * behind its own separator.
 */
export function groupBatchActions(opts: {
  toast: BatchToast;
  selectedIds: string[];
}): BatchMenuGroup {
  const all = buildBatchActions(opts);
  const bucket = (seq: readonly string[], ids: Set<string>) =>
    seq
      .filter((id) => ids.has(id))
      .flatMap((id) => all.filter((a) => a.id === id));
  return {
    edit: bucket(EDIT, EDIT_IDS),
    structure: bucket(STRUCTURE, STRUCTURE_IDS),
    visibility: bucket(VISIBILITY, VISIBILITY_IDS),
    select: buildSelectActions(opts.selectedIds),
    delete: all.find((a) => a.danger),
  };
}
