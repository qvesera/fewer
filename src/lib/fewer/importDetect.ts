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
import type { FileImportFormat } from "./importTypes";

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

/** Step 1: a JSON *graph* — raw export `{ nodes, … }` or the Fewer document
 *  (`{ graph: { data: { nodes } } }`); a parses-but-not-a-graph document
 *  falls through so the user gets a sensible parse instead of "Invalid JSON:
 *  missing 'nodes' array". */
function looksLikeJson(trimmed: string): boolean {
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const o =
      parsed !== null && typeof parsed === "object"
        ? (parsed as { nodes?: unknown; graph?: { data?: { nodes?: unknown } } })
        : null;
    return !!o && (Array.isArray(o.nodes) || Array.isArray(o.graph?.data?.nodes));
  } catch {
    // Not JSON after all — fall through to the other detectors.
    return false;
  }
}

/** Step 2: Graphviz opens with a graph keyword at the top of the document
 *  (leading `//`/`#` comments allowed) and needs an edge — requiring both
 *  keeps prose mentioning "graph" from winning. */
function looksLikeDot(trimmed: string): boolean {
  const withoutLeadingComments = trimmed.replace(LEADING_COMMENTS, "");
  return (
    DOT_HEADER.test(withoutLeadingComments) &&
    withoutLeadingComments.includes("{") &&
    /->|--/.test(withoutLeadingComments)
  );
}

/** Step 3: `mkdir` lines — before csv so a comma inside a quoted path is not
 *  read as a column boundary. */
function looksLikeScript(trimmed: string): boolean {
  return /^\s*mkdir\b/im.test(trimmed);
}

/** Step 4: glyph trees — before csv on purpose: a comma inside a tree name must
 *  not win over the glyphs, and this class is exactly the one parseASCIITree
 *  keys depth on. Tests the raw content, like the original: glyphs may sit
 *  anywhere in the document. */
function looksLikeTreeGlyphs(content: string): boolean {
  return TREE_GLYPHS.test(content);
}

/** Step 5: a delimited table with at least two rows, or our own export (whose
 *  header is distinctive enough to count on its own). */
function looksLikeCsv(content: string): boolean {
  const rows = parseCsvRows(content);
  const header = rows[0] ?? [];
  if (isExportCsv(header)) return true;
  return header.length >= 2 && rows.length >= 2;
}

/**
 * Guess which parser should read `content`.
 *
 * A scanner, not a parser — the parsers already exist and are reused;
 * detection only has to choose between them. The steps run in the order
 * documented above: each is deliberately cheap, order decides every tie, and
 * the tree fallback loses all of them. Ceilings, named rather than built: a
 * single-column list (no delimiters, no glyphs) detects as tree (line 1
 * becomes the root), so forcing CSV needs the user's override; a hand-written
 * CSV whose header row has no commas is the same case. The upgrade path is a
 * confidence score rather than more heuristics.
 *
 * Pure and total: never throws, safe to call on every keystroke.
 */
export function detectImportFormat(content: string): FileImportFormat {
  const trimmed = content.trimStart();
  if (trimmed === "") return "tree";
  if (looksLikeJson(trimmed)) return "json";
  if (looksLikeDot(trimmed)) return "dot";
  if (looksLikeScript(trimmed)) return "script";
  if (looksLikeTreeGlyphs(content)) return "tree";
  if (looksLikeCsv(content)) return "csv";
  // 6. tree — the tolerant fallback: indented text, flat lists, and anything
  // the steps above did not claim. It accepts almost anything, so it loses
  // every tie.
  return "tree";
}
