/**
 * Batch-rename label transform shared by the store's `renameNodes` action and
 * the BatchRenameDialog preview. Operates on a node's label only — extensions
 * are preserved separately by the store (a trailing ".ext" in user input is
 * treated as part of the label text and re-parsed by the store).
 */
export interface BatchRenameOptions {
  /** Text to find in each label. Empty/undefined = skip replacement. */
  find?: string;
  /** Replacement for `find`. */
  replace?: string;
  /** Prepended to every label. */
  prefix?: string;
  /** Appended to every label (before numbering). */
  suffix?: string;
  /** Append " <n>" to each label, counting from `numberStart`. */
  numbered?: boolean;
  numberStart?: number;
}

export function applyBatchRename(label: string, opts: BatchRenameOptions, index: number): string {
  let out = label;
  if (opts.find) out = out.split(opts.find).join(opts.replace ?? "");
  out = `${opts.prefix ?? ""}${out}${opts.suffix ?? ""}`;
  if (opts.numbered) out = `${out} ${(opts.numberStart ?? 1) + index}`;
  return out;
}
