/**
 * Format detection for the file origin's text payloads.
 *
 * The panel used to ask which parser to use; now it shows what was detected.
 * Content is the single source of truth for which parser runs, and
 * `resolveFileFormat` (importFlow) folds in the user's override on top.
 *
 * Pure and total: never throws, safe to call on every keystroke.
 */
import { isExportCsv, parseCsvRows } from "./csvModel";
import type { FileImportFormat } from "./importFlow";

/** Header of a DOT document: `strict` / `digraph` / `graph` opening the file. */
const DOT_HEADER = /^(?:strict\s+)?(?:di)?graph\b/i;

/** Leading `//` or `#` comment lines, so a commented DOT file still matches. */
const LEADING_COMMENTS = /^(\s*(?:\/\/|#)[^\n]*\n)+/;

/**
 * Box-drawing characters — exactly the set `parseASCIITree` keys its depth on
 * (`/^[\s│├└─]+/`). Checked before csv so a comma inside a tree name cannot
 * win over the glyphs, and keyed to the parser's own class so the two cannot
 * disagree about what a tree looks like.
 */
const TREE_GLYPHS = /[│├└─]/;

/**
 * Guess which parser should read `content`.
 *
 * Order matters, and each step is deliberately cheap:
 *
 *  1. **json** — must be a graph, not just any JSON value: a parses-but-not-a-graph
 *     document falls through so the user gets a sensible parse instead of
 *     "Invalid JSON: missing 'nodes' array".
 *  2. **dot** — Graphviz opens with a graph keyword at the top of the document
 *     and needs an edge; requiring both keeps prose mentioning "graph" from winning.
 *  3. **script** — `mkdir` lines, before csv so a comma inside a quoted path is
 *     not read as a column boundary.
 *  4. **csv** — a delimited table with at least two rows, or our own export
 *     (whose header is distinctive enough to count on its own).
 *  5. **tree** — the tolerant fallback: glyph trees, indented text, flat lists.
 *     It accepts almost anything, which is exactly why it loses every tie.
 *
 * ponytail: this is a scanner, not a parser — the parsers already exist and are
 * reused; detection only has to choose between them. Ceilings, named rather
 * than built: a single-column list (no delimiters, no glyphs) detects as tree
 * (line 1 becomes the root), so forcing CSV needs the user's override; and a
 * hand-written CSV whose header row has no commas is the same case. The
 * upgrade path is a confidence score rather than more heuristics.
 */
export function detectImportFormat(content: string): FileImportFormat {
  const trimmed = content.trimStart();
  if (trimmed === "") return "tree";

  // 1. json ---------------------------------------------------------------
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const hasNodes =
        parsed !== null && typeof parsed === "object" && Array.isArray((parsed as { nodes?: unknown }).nodes);
      if (hasNodes) return "json";
    } catch {
      // Not JSON after all — fall through to the other detectors.
    }
  }

  // 2. dot ----------------------------------------------------------------
  const withoutLeadingComments = trimmed.replace(LEADING_COMMENTS, "");
  if (
    DOT_HEADER.test(withoutLeadingComments) &&
    withoutLeadingComments.includes("{") &&
    /->|--/.test(withoutLeadingComments)
  ) {
    return "dot";
  }

  // 3. script -------------------------------------------------------------
  if (/^\s*mkdir\b/im.test(trimmed)) return "script";

  // 4. ascii tree, by glyph ------------------------------------------------
  // Before csv on purpose: a comma inside a tree name must not win over the
  // glyphs, and this class is exactly the one parseASCIITree keys depth on.
  if (TREE_GLYPHS.test(content)) return "tree";

  // 5. csv ----------------------------------------------------------------
  const rows = parseCsvRows(content);
  const header = rows[0] ?? [];
  if (isExportCsv(header)) return "csv";
  if (header.length >= 2 && rows.length >= 2) return "csv";

  // 6. tree ---------------------------------------------------------------
  // The tolerant fallback: indented text, flat lists, and anything the steps
  // above did not claim. It accepts almost anything, so it loses every tie.
  return "tree";
}
