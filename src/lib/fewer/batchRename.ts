/**
 * Batch-rename transform shared by the store's `renameNodes` action and
 * the BatchRenameDialog preview. Takes a node's FULL name (label + extension,
 * e.g. "Button.tsx"): find/replace runs over the whole name so extension
 * swaps like ".tsx" → ".jsx" work, while prefix/suffix/numbering are inserted
 * before a trailing extension so they never corrupt it. Callers pass the
 * result to the store, which re-parses the trailing extension.
 */
export interface BatchRenameOptions {
  /** Text to find in each name. Empty/undefined = skip replacement. `*` = wildcard (match anything). */
  find?: string;
  /** Replacement for `find`. A `*` here inserts the text captured by the matching `*` in `find`. */
  replace?: string;
  /** Prepended to every name. */
  prefix?: string;
  /** Appended to every name (before numbering). */
  suffix?: string;
  /** Append " <n>" to each name, counting from `numberStart`. */
  numbered?: boolean;
  numberStart?: number;
}

/** Split a trailing ".ext" off a name. Dotfiles (".gitignore") count as extensionless — matches getFileExtension. */
function splitExtension(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? { base: name.slice(0, i), ext: name.slice(i) } : { base: name, ext: "" };
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** Build a regex from a wildcard pattern: each `*` becomes a greedy capture group, everything else is literal. */
function wildcardToRegex(find: string): RegExp {
  let pattern = "";
  for (const ch of find) pattern += ch === "*" ? "(.*)" : ch.replace(REGEX_META, "\\$&");
  return new RegExp(pattern);
}

/** Build a regex replacement string: each `*` references its capture group, literal `$` is escaped. */
function wildcardToReplacement(replace: string): string {
  let group = 0;
  let out = "";
  for (const ch of replace) {
    if (ch === "*") out += `$${++group}`;
    else out += ch === "$" ? "$$" : ch;
  }
  return out;
}

export function applyBatchRename(name: string, opts: BatchRenameOptions, index: number): string {
  let out = name;
  if (opts.find) {
    if (opts.find.includes("*")) {
      // Wildcard mode: `*` matches anything. No match → name left as-is.
      const re = wildcardToRegex(opts.find);
      if (re.test(out)) out = out.replace(re, wildcardToReplacement(opts.replace ?? ""));
    } else {
      out = out.split(opts.find).join(opts.replace ?? "");
    }
  }
  const { base, ext } = splitExtension(out);
  out = `${opts.prefix ?? ""}${base}${opts.suffix ?? ""}`;
  if (opts.numbered) out = `${out} ${(opts.numberStart ?? 1) + index}`;
  return `${out}${ext}`;
}
