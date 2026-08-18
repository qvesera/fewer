/**
 * Shared "Created with fewer" branding used by both the exporters (exportUtils /
 * scriptExport) and the import parsers that must strip it back out on round-trip.
 * Single source so export and import can never drift — what gets written is
 * exactly what gets stripped.
 */

/** Public marketing homepage (overridable via env). */
export const FEWER_HOME_URL =
  process.env.NEXT_PUBLIC_HOME_URL ?? "https://fewer.direct";

/** One credit line appended to every export when branding is enabled. */
export const FEWER_CREDIT = `Created with fewer — ${FEWER_HOME_URL}`;

/** Leading title line on the ASCII directory-tree export. */
export const TREE_HEADER = "Directory Tree Structure";

/** Tolerant matcher for the credit line (ignores the URL changing later). */
export const FEWER_CREDIT_RE = /^\s*created with fewer\b/i;

/**
 * Matches the compact lines that tree-export tools append after the forest,
 * e.g. "3 directories, 2 files" / "12 entries". We neither emit these today
 * nor require them, but stripping them keeps third-party `tree` output easy to
 * import. ponytail: ceiling is a magic-word strip-list — unknown hand-written
 * prose still imports as a node; upgrade path is a structured marker if ever
 * needed (nobody's done that for ASCII trees yet).
 */
export const TREE_SUMMARY_RE =
  /^\s*\d+\s+(?:director(?:y|ies)|file|files|entr(?:y|ies))\b/i;