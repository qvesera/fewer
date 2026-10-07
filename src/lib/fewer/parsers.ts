import type { SymlinkInfo, TreeEntry } from "./types";
import { FEWER_CREDIT_RE, TREE_HEADER, TREE_SUMMARY_RE } from "./branding";
import { sortFoldersFirst, sortTreeFoldersFirst } from "./treeSort";
import type { FileImportFormat } from "./importFlow";
import {
  CSV_EXPORT_HEADERS,
  cell,
  guessCsvMapping,
  isCsvMappingUsable,
  isExportCsv,
  parseCsvRows,
  type CsvColumnMap,
  type CsvMappingField,
} from "./csvModel";

/**
 * One row of a flat, id-referenced graph — what JSON, CSV and DOT all reduce
 * to before `buildTreeFromFlat` turns it back into a TreeEntry. `name` is the
 * display name WITH its extension (see `fileNameOf`).
 */
interface FlatNode {
  id: string;
  name: string;
  type: "folder" | "file";
  symlink?: SymlinkInfo;
  size?: number;
}

interface FlatEdge {
  source: string;
  target: string;
}

/**
 * The node's display name, extension included. The exporters strip the
 * extension from `label` and carry it separately, so `path`'s basename is the
 * only faithful source; `label` + `extension` is the fallback for rows with no
 * path at all. Without this, a JSON/CSV round-trip silently loses every
 * extension.
 */
function fileNameOf(path: string | undefined, label: string, extension?: string | null): string {
  const base = (path ?? "").split("/").filter(Boolean).pop();
  if (base) return base;
  return extension ? `${label}.${extension}` : label;
}

/**
 * Fold flat id-referenced rows back into a single rooted tree. Folders keep
 * their children, everything else is a file. Errors loudly instead of
 * silently dropping entries: a graph with no root, more than one root, or a
 * cycle cannot be laid out, and importing part of the data would be worse than
 * refusing.
 */
function buildTreeFromFlat(nodes: FlatNode[], edges: FlatEdge[]): TreeEntry {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childMap = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue; // dangling edge
    const children = childMap.get(e.source) ?? [];
    children.push(e.target);
    childMap.set(e.source, children);
    hasParent.add(e.target);
  }

  const roots = nodes.filter((n) => !hasParent.has(n.id));
  if (roots.length === 0) throw new Error("No root node found: every entry has a parent");
  if (roots.length > 1) {
    throw new Error(`Expected one root node, found ${roots.length}: the import must be a single tree`);
  }

  function build(id: string, seen: Set<string>): TreeEntry {
    if (seen.has(id)) throw new Error("Cycle detected in the imported graph");
    seen.add(id);

    const node = nodeMap.get(id)!;
    const children = (childMap.get(id) ?? []).map((c) => build(c, seen));
    sortFoldersFirst(children);

    return {
      name: node.name,
      type: node.type,
      ...(node.size ? { size: node.size } : {}),
      children: children.length > 0 ? children : undefined,
      ...(node.symlink ? { symlink: node.symlink } : {}),
    };
  }

  return build(roots[0]!.id, new Set());
}

/**
 * Parse a JSON graph export back into a TreeEntry.
 * The JSON format is the one produced by exportUtils.ts exportJSON().
 */
export function parseJSONGraph(json: string): TreeEntry {
  const parsed = JSON.parse(json);
  // T-101: accept Fewer graph documents (.fwr envelopes: { format_version,
  //  app, graph }) as well as raw exportJSON payloads ({ nodes, ... }).
  const data = parsed?.graph?.data && parsed.graph.data.nodes ? parsed.graph.data : parsed;
  if (!data.nodes || !Array.isArray(data.nodes)) {
    throw new Error("Invalid JSON: missing 'nodes' array");
  }

  const nodes: FlatNode[] = data.nodes.map(
    (n: {
      id: string;
      label: string;
      type: string;
      path?: string;
      extension?: string | null;
      size?: number;
      symlink?: SymlinkInfo;
    }) => ({
      id: n.id,
      // Symlink round-trip: the exporter includes it only for links.
      name: fileNameOf(n.path, n.label, n.extension),
      type: n.type === "folder" ? "folder" : "file",
      ...(typeof n.symlink === "object" && n.symlink?.target ? { symlink: n.symlink } : {}),
      ...(typeof n.size === "number" && n.size > 0 ? { size: n.size } : {}),
    }),
  );

  const edges: FlatEdge[] = (data.edges ?? []).map(
    (e: { source: string; target: string }) => ({ source: e.source, target: e.target }),
  );

  return buildTreeFromFlat(nodes, edges);
}

/**
 * Parse an ASCII tree representation into a TreeEntry.
 * Supports the standard tree format with ├──, └──, │, and indentation.
 *
 * Example input:
 *   root/
 *   ├── src/
 *   │   ├── App.tsx
 *   │   └── main.tsx
 *   └── package.json
 */
export function parseASCIITree(text: string): TreeEntry {
  const entries = collectAsciiEntries(text);
  const isFolder = detectFolders(entries);

  // Build the tree from entries
  const root: TreeEntry = {
    name: entries[0].name,
    type: isFolder[0] ? "folder" : "file",
    children: isFolder[0] ? [] : undefined,
  };

  const stack: { entry: TreeEntry; depth: number }[] = [{ entry: root, depth: 0 }];

  for (let i = 1; i < entries.length; i++) {
    const { name, depth, symlinkTarget } = entries[i];
    const folder = isFolder[i];
    const entry: TreeEntry = {
      name,
      type: folder ? "folder" : "file",
      children: folder ? [] : undefined,
      ...(symlinkTarget ? { symlink: { target: symlinkTarget, followed: false } } : {}),
    };

    // Walk up stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].entry;
    parent.children = parent.children ?? [];
    parent.children.push(entry);

    if (folder) {
      stack.push({ entry, depth });
    }
  }

  // Sort all children recursively
  sortTreeFoldersFirst(root);

  return root;
}

/** One raw ASCII-tree line: name, tree depth, whether the name ends with "/",
 *  and the target when the line is a `name -> target` symlink entry. */
interface RawEntry {
  name: string;
  depth: number;
  hasSlash: boolean;
  /** Raw link target ("v012") when the line used the `name -> target` convention. */
  symlinkTarget?: string;
}

/** Filter blanks/comments/branding lines, then split each line into name + depth. */
function collectAsciiEntries(text: string): RawEntry[] {
  const lines = text
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (!t || t.startsWith("#")) return false;
      if (t === TREE_HEADER) return false;
      if (FEWER_CREDIT_RE.test(t)) return false;
      if (TREE_SUMMARY_RE.test(t)) return false;
      return true;
    });

  if (lines.length === 0) throw new Error("Empty tree text");

  const entries: RawEntry[] = [];

  // The first line is the root
  const firstLine = lines[0]!.replace(/\/\s*$/, "").trim();
  entries.push({ name: firstLine, depth: 0, hasSlash: lines[0]!.includes("/") });

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;

    // Calculate depth by counting tree characters
    const treePart = line.match(/^[\s│├└─]+/);
    let depth = 0;
    let name = line.trim();

    if (treePart) {
      const prefix = treePart[0]!;
      // Count depth: every 4 chars = 1 level
      depth = Math.floor(prefix.replace(/│/g, " ").length / 4);
      name = line.slice(prefix.length).trim();
    }

    // Symlink convention (shell style): "name -> target" or "name → target".
    // Extracted BEFORE slash/annotation handling so a folder link keeps its
    // trailing "/" (and with it, its folder typing) after the arrow is split off.
    let symlinkTarget: string | undefined;
    const linkMatch = name.match(/^(.+?)\s*(?:->|→)\s*(.+)$/);
    if (linkMatch) {
      name = linkMatch[1]!.trim();
      // The target may carry its own trailing annotation ("-> v012 ·1.2 KB").
      symlinkTarget = linkMatch[2]!.trim().replace(/\s*[·(].*$/, "").trim();
    }

    // Remove trailing slash for folders, trailing size annotations
    const hasSlash = name.endsWith("/");
    name = name.replace(/\/\s*$/, "").trim();
    // Remove trailing annotations like " (1.2 KB)" or "·1.2 KB"
    name = name.replace(/\s*[·(].*$/, "").trim();
    // Remove leading bullet if present
    name = name.replace(/^[├└─]\s*/, "").trim();

    if (!name) continue;

    entries.push({ name, depth, hasSlash, symlinkTarget });
  }

  return entries;
}

/**
 * Determine which entries are folders:
 *   1. Name ends with "/", OR
 *   2. A subsequent entry at a deeper depth exists (has children)
 */
function detectFolders(entries: RawEntry[]): boolean[] {
  const isFolder = new Array<boolean>(entries.length).fill(false);
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.hasSlash) {
      isFolder[i] = true;
      continue;
    }
    // Look ahead for any entry at a strictly greater depth
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[j]!.depth > entries[i]!.depth) {
        isFolder[i] = true;
        break;
      }
      if (entries[j]!.depth <= entries[i]!.depth) {
        // A sibling or ancestor was reached — no deeper children found
        break;
      }
    }
  }
  return isFolder;
}

/**
 * Parse a shell script (mkdir -p commands) or batch script (mkdir commands)
 * into a TreeEntry.
 *
 * Example input (shell):
 *   mkdir -p "src/components"
 *   mkdir -p "src/hooks"
 *   mkdir "public"
 *
 * Example input (batch):
 *   mkdir "src\components"
 *   mkdir "src\hooks"
 */
export function parseScript(text: string): TreeEntry {
  const lines = text.split("\n").filter((l) => l.trim());

  if (lines.length === 0) throw new Error("Empty script");

  const paths = collectMkdirPaths(lines);
  if (paths.length === 0) throw new Error("No mkdir commands found in script");

  // Build tree from paths
  const rootName = paths[0].split("/")[0];
  const root: TreeEntry = {
    name: rootName,
    type: "folder",
    children: [],
  };

  for (const path of paths) {
    insertPath(root, path);
  }

  sortAlphabetical(root);

  return root;
}

/** Extract the path argument of every `mkdir [-p] "path"` line, normalizing
 *  batch backslashes to "/" and dropping trailing slashes. */
function collectMkdirPaths(lines: string[]): string[] {
  const paths: string[] = [];
  for (const line of lines) {
    const match = line.match(/mkdir\s+(?:-p\s+)?["']?([^"'\n]+)["']?/i);
    if (!match) continue;
    let p = match[1].trim();
    p = p.replace(/\\/g, "/");
    p = p.replace(/\/$/, "");
    if (p) paths.push(p);
  }
  return paths;
}

/** Insert a "/"-separated path into the tree, creating missing folders. */
function insertPath(root: TreeEntry, path: string): void {
  const parts = path.split("/");
  let current = root;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    current.children = current.children ?? [];
    let next = current.children.find((c) => c.name === part && c.type === "folder");

    if (!next) {
      next = { name: part, type: "folder", children: [] };
      current.children.push(next);
    }
    current = next;
  }
}

/** Sort a whole tree: alphabetical only (mkdir order is not folder-first). */
function sortAlphabetical(entry: TreeEntry): void {
  if (!entry.children) return;
  entry.children.sort((a, b) => a.name.localeCompare(b.name));
  for (const c of entry.children) sortAlphabetical(c);
}

/* -------------------------------------------------------------------------- */
/*                                  CSV                                       */
/* -------------------------------------------------------------------------- */

/**
 * Format literals of the CSV export, mirrored here because parsers must not
 * import `exportUtils` (it drags the DOM-backed renderer into the startup
 * path). The header itself is validated by `csvModel.isExportCsv` against
 * `CSV_EXPORT_HEADERS`; `exportUtils.test.ts` round-trips both directions.
 */
const CSV_EDGES_MARKER = "# edges";

/**
 * Parse a CSV into a TreeEntry. Two shapes are understood:
 *
 *  1. **Our export** — detected by its header (`csvModel.isExportCsv`): a
 *     nodes block followed by an `# edges` block that says which node parents
 *     which. No column mapping needed.
 *  2. **Anything else** — the caller maps columns (the mapper UI pre-fills the
 *     guess). Hierarchy comes from the `parent` column when present, else from
 *     the `path` column, where every path prefix on the way becomes a folder.
 */
export function parseCSVGraph(text: string, mapping?: CsvColumnMap): TreeEntry {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error("No CSV rows found");

  const headers = rows[0]!;
  if (isExportCsv(headers)) return parseExportCsv(rows);

  const map = mapping && isCsvMappingUsable(mapping) ? mapping : guessCsvMapping(headers);
  if (!isCsvMappingUsable(map)) {
    throw new Error(
      "No name column found — pick which column holds the entry name before importing",
    );
  }

  const dataRows = rows.slice(1).filter((r) => !isCommentRow(r));
  if (dataRows.length === 0) throw new Error("No CSV rows found");

  // Hierarchy: parent column first, then path, then a bare list of names
  // treated as paths (a pasted column of "src/hooks/useX.ts" lines).
  const hasParent = map.parent >= 0 && dataRows.some((r) => cell(r, map.parent) !== "");
  const hasPath = map.path >= 0 && dataRows.some((r) => cell(r, map.path) !== "");
  const nameIsPath =
    !hasParent && !hasPath && dataRows.some((r) => cell(r, map.name).includes("/"));

  if (hasParent) return treeFromParentColumn(dataRows, map);
  if (hasPath || nameIsPath) {
    return treeFromPathColumn(dataRows, map, nameIsPath ? "name" : "path");
  }

  // Flat rows with no hierarchy at all: the first row becomes the root and
  // every later row a child — a CSV of bare names is still a tree someone
  // wants to see, not an error.
  const nodes: FlatNode[] = dataRows.map((row, i) => ({
    id: `row-${i}`,
    name: cell(row, map.name),
    type: rowType(row, map),
  }));
  const root = nodes[0]!;
  root.type = "folder";
  return buildTreeFromFlat(
    nodes,
    nodes.slice(1).map((n) => ({ source: root.id, target: n.id })),
  );
}

/**
 * Our own export: `id,label,path,…` rows followed by an `id,source,target`
 * block. `rows[0]` is the header row — `parseCSVGraph` already vouched for it
 * via `isExportCsv`, so it is skipped by position, never string-matched
 * (parseCsvRows has already split it into cells).
 */
function parseExportCsv(rows: string[][]): TreeEntry {
  const nodes: FlatNode[] = [];
  const edges: FlatEdge[] = [];

  let inEdges = false;
  let sawEdgesHeader = false;
  for (const row of rows.slice(1)) {
    const first = (row[0] ?? "").trim();
    if (first === CSV_EDGES_MARKER) {
      inEdges = true;
      sawEdgesHeader = false;
      continue;
    }
    // `#`-prefixed rows are comments in both blocks (credit line, stray notes).
    if (first === "" || first.startsWith("#")) continue;
    if (inEdges) {
      // Skip the edges block's own header line ("id,source,target") once.
      if (!sawEdgesHeader) {
        sawEdgesHeader = true;
        continue;
      }
      edges.push({ source: (row[1] ?? "").trim(), target: (row[2] ?? "").trim() });
      continue;
    }
    nodes.push({
      id: first,
      // `path`'s basename is the only column that still carries the extension.
      name: fileNameOf(row[2], row[1] ?? "", row[4]),
      type: (row[3] ?? "").trim() === "folder" ? "folder" : "file",
      ...(row[7] ? { symlink: { target: row[7].trim(), followed: false } } : {}),
    });
  }

  if (nodes.length === 0) throw new Error("No CSV rows found");
  return buildTreeFromFlat(nodes, edges);
}

/** `# …` lines are comments in our CSV shape (section markers, credit line). */
function isCommentRow(row: string[]): boolean {
  return (row[0] ?? "").trimStart().startsWith("#");
}

/** File vs folder: explicit `type` column wins, then a trailing slash. */
function rowType(row: string[], map: CsvColumnMap): "folder" | "file" {
  const type = cell(row, map.type).toLowerCase();
  if (type === "folder" || type === "dir" || type === "directory") return "folder";
  if (type === "file") return "file";
  return cell(row, map.name).endsWith("/") ? "folder" : "file";
}

/** Build from a `parent` column: rows reference their parent by id/path/name. */
function treeFromParentColumn(dataRows: string[][], map: CsvColumnMap): TreeEntry {
  const nodes: FlatNode[] = [];
  const edges: FlatEdge[] = [];
  const byKey = new Map<string, string>();

  dataRows.forEach((row, i) => {
    const id = `row-${i}`;
    const name = cell(row, map.name);
    const path = map.path >= 0 ? cell(row, map.path) : "";
    if (name) byKey.set(name, id);
    if (path) byKey.set(path, id);
    nodes.push({
      id,
      name: name || path || id,
      type: rowType(row, map),
      ...(cell(row, map.symlinkTarget)
        ? { symlink: { target: cell(row, map.symlinkTarget), followed: false } }
        : {}),
    });
  });

  dataRows.forEach((row, i) => {
    const parentId = byKey.get(cell(row, map.parent));
    // An unresolvable parent leaves the row rootless, so buildTreeFromFlat
    // reports "more than one root" instead of nesting it somewhere wrong.
    if (parentId && parentId !== `row-${i}`) edges.push({ source: parentId, target: `row-${i}` });
  });

  return buildTreeFromFlat(nodes, edges);
}

/** Build from a path column: every folder prefix on the way becomes a node. */
function treeFromPathColumn(
  dataRows: string[][],
  map: CsvColumnMap,
  pathField: CsvMappingField,
): TreeEntry {
  const root: TreeEntry = { name: "", type: "folder", children: [] };
  let rootNamed = false;

  dataRows.forEach((row) => {
    const parts = cell(row, map[pathField]).split("/").filter(Boolean);
    if (parts.length === 0) return;

    // The first path segment names the tree root, exactly like parseScript.
    if (!rootNamed) {
      root.name = parts[0]!;
      rootNamed = true;
      if (parts.length === 1) return;
    }

    let current = root;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const type = isLast ? rowType(row, map) : "folder";
      current.children = current.children ?? [];
      let next = current.children.find((c) => c.name === part);
      if (!next) {
        next = {
          name: part,
          type,
          children: type === "folder" ? [] : undefined,
          ...(isLast && cell(row, map.symlinkTarget)
            ? { symlink: { target: cell(row, map.symlinkTarget), followed: false } }
            : {}),
        };
        current.children.push(next);
      }
      current = next;
    }
  });

  if (!rootNamed) throw new Error("No path values found in the mapped column");
  sortTreeFoldersFirst(root);
  return root;
}

/* -------------------------------------------------------------------------- */
/*                                  DOT                                       */
/* -------------------------------------------------------------------------- */

/** A DOT statement, flattened — subgraphs are transparent (see parseDOTGraph). */
interface DotNode {
  id: string;
  label?: string;
  symlinkAttr?: string;
}

interface DotEdge {
  source: string;
  target: string;
}

/**
 * Parse a Graphviz DOT document into a TreeEntry.
 *
 * Handles what our exporter writes (quoted ids, `label="Name\n.ext"` labels,
 * dashed symlink edges) and, on the same rules, ordinary third-party `dot`
 * output: a node is a folder when something else points at it, a file
 * otherwise — DOT has no folder concept of its own.
 *
 * ponytail: the ceiling is flattening — `cluster_*` subgraphs contribute their
 * nodes to the enclosing scope instead of nesting, and `node [...]`/`graph [...]`
 * defaults are ignored rather than applied per statement. Both only matter for
 * exotic Graphviz sources; the upgrade path is a full attribute-defaults walk.
 */
export function parseDOTGraph(text: string): TreeEntry {
  const { nodes, edges } = scanDot(text);
  if (nodes.length === 0) throw new Error("No nodes found in the DOT graph");

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasChildren = new Set<string>();
  const links: FlatEdge[] = [];

  // Every edge is containment. The exporter dashes an edge when its target is a
  // symlink — that marks the TARGET as a link (its own `symlink` attribute
  // carries the value), not a non-hierarchical "points at" relation, and DOT
  // offers no other structure to read nesting from.
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    hasChildren.add(e.source);
    links.push({ source: e.source, target: e.target });
  }

  const flat: FlatNode[] = nodes.map((n) => {
    const facts = labelFacts(n.label);
    const target = n.symlinkAttr ?? facts.symlinkTarget;
    return {
      id: n.id,
      name: facts.name || n.id,
      type: facts.type ?? (hasChildren.has(n.id) ? "folder" : "file"),
      ...(target ? { symlink: { target, followed: false } } : {}),
    };
  });

  return buildTreeFromFlat(flat, links);
}

/** Split an exported `Name\n.ext` (and optional `↷ target`) label back apart. */
function labelFacts(label?: string): {
  name: string;
  type?: "folder" | "file";
  symlinkTarget?: string;
} {
  if (!label) return { name: "" };
  const parts = label.split("\n").map((p) => p.trim());
  const name = parts[0] ?? "";
  const second = parts[1] ?? "";
  const third = parts[2] ?? "";
  const symlinkTarget = third.startsWith("↷") ? third.slice(1).trim() : undefined;

  // Our exporter writes either `.ext` or `folder`/`file` on the second line —
  // that is the only shape this parser can type a node from.
  if (second === "folder" || second === "file") {
    return { name, type: second, ...(symlinkTarget ? { symlinkTarget } : {}) };
  }
  if (second.startsWith(".")) {
    return { name: `${name}${second}`, type: "file", ...(symlinkTarget ? { symlinkTarget } : {}) };
  }
  // Any other label (third-party DOT, wrapped Graphviz text) is display text:
  // keep every line instead of truncating to the first.
  return {
    name: parts.filter(Boolean).join(" "),
    ...(symlinkTarget ? { symlinkTarget } : {}),
  };
}

type DotToken = { t: "id" | "punct"; v: string };

/**
 * Walk the token stream into node + edge statements. Braces are transparent,
 * so a subgraph's statements simply parse as if written in the parent scope.
 */
function scanDot(text: string): { nodes: DotNode[]; edges: DotEdge[] } {
  const tokens = dotTokens(text);
  const nodes = new Map<string, DotNode>();
  const edges: DotEdge[] = [];

  const ensure = (id: string): DotNode => {
    let node = nodes.get(id);
    if (!node) {
      node = { id };
      nodes.set(id, node);
    }
    return node;
  };

  while (tokens.length > 0) {
    const tok = tokens.shift()!;
    if (tok.t !== "id") continue;
    const lower = tok.v.toLowerCase();

    if (lower === "strict") continue;
    // `digraph foo {` / `graph [` — consume the optional graph name and any
    // default-attribute list, or its tokens become bogus nodes.
    if (lower === "digraph" || lower === "graph") {
      if (tokens[0]?.t === "id") tokens.shift();
      if (tokens[0]?.t === "punct" && tokens[0].v === "[") skipAttrList(tokens);
      continue;
    }
    // `node [...]` / `edge [...]` defaults — ignored (see the ceiling note).
    if (
      (lower === "node" || lower === "edge") &&
      tokens[0]?.t === "punct" &&
      tokens[0].v === "["
    ) {
      skipAttrList(tokens);
      continue;
    }
    // `subgraph foo` / `subgraph {` — the name and braces are optional noise.
    if (lower === "subgraph") {
      if (tokens[0]?.t === "id") tokens.shift();
      continue;
    }

    if (tokens[0]?.t === "punct" && (tokens[0].v === "->" || tokens[0].v === "--")) {
      tokens.shift();
      const rhs = tokens.shift();
      if (!rhs || rhs.t !== "id") continue;
      // Read into a local: TS keeps narrowing `tokens[0].v` from the arrow
      // check above, so a direct comparison would be rejected as unreachable.
      const ahead = tokens[0];
      if (ahead?.t === "punct" && ahead.v === "[") readAttrList(tokens); // edge attrs: visual only
      ensure(tok.v);
      ensure(rhs.v);
      edges.push({ source: tok.v, target: rhs.v });
      continue;
    }

    const attrs = tokens[0]?.t === "punct" && tokens[0].v === "[" ? readAttrList(tokens) : {};
    const node = ensure(tok.v);
    if (attrs.label !== undefined) node.label = attrs.label;
    if (attrs.symlink !== undefined) node.symlinkAttr = attrs.symlink;
  }

  return { nodes: [...nodes.values()], edges };
}

/** Token list for the scanner: ids, arrows, brackets, `=`, `,`, `;`, `{`, `}`. */
function dotTokens(text: string): DotToken[] {
  const tokens: DotToken[] = [];
  const isIdChar = (c: string) => /[A-Za-z0-9_.:]/.test(c);
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Comments — handled here, not in a pre-pass, because the `"` branch below
    // consumes strings atomically: anything reached at this point is code, so
    // `fillcolor="#fff"` never loses its value to a comment strip.
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === '"') {
      let value = "";
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < text.length) {
          const next = text[i + 1]!;
          // DOT escapes: \n is a newline inside a label, \" and \\ are literal.
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
        } else {
          value += text[i];
          i++;
        }
      }
      i++; // closing quote
      tokens.push({ t: "id", v: value });
      continue;
    }
    if (ch === "-" && text[i + 1] === ">") {
      tokens.push({ t: "punct", v: "->" });
      i += 2;
      continue;
    }
    if (ch === "-" && text[i + 1] === "-") {
      tokens.push({ t: "punct", v: "--" });
      i += 2;
      continue;
    }
    // Negative attribute values (`margin=-0.5`) are ids, not punctuation.
    if (ch === "-" && /[0-9.]/.test(text[i + 1] ?? "")) {
      let value = "-";
      i++;
      while (i < text.length && /[0-9.eE+_]/.test(text[i]!)) {
        value += text[i];
        i++;
      }
      tokens.push({ t: "id", v: value });
      continue;
    }
    if ("[]{}=,;".includes(ch)) {
      tokens.push({ t: "punct", v: ch });
      i++;
      continue;
    }
    if (isIdChar(ch)) {
      let value = "";
      while (i < text.length && isIdChar(text[i]!)) {
        value += text[i];
        i++;
      }
      // A hyphen continues the id only when it isn't the start of -> or --,
      // so `my-node` stays one token while `a->b` still splits into three.
      while (i < text.length && text[i] === "-" && !">-".includes(text[i + 1] ?? "")) {
        value += text[i];
        i++;
        while (i < text.length && isIdChar(text[i]!)) {
          value += text[i];
          i++;
        }
      }
      tokens.push({ t: "id", v: value });
      continue;
    }
    i++; // anything else is skipped
  }
  return tokens;
}

/** Read `[k="v", k2=v2]` into a map; the leading `[` must be the head token. */
function readAttrList(tokens: DotToken[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  tokens.shift(); // "["
  let key = "";
  while (tokens.length > 0) {
    const tok = tokens.shift()!;
    if (tok.v === "]") break;
    if (tok.v === "," || tok.v === "=") continue;
    if (key === "") {
      key = tok.v;
      continue;
    }
    attrs[key.toLowerCase()] = tok.v;
    key = "";
  }
  return attrs;
}

/** Skip a `[...]` list whose contents we do not care about. */
function skipAttrList(tokens: DotToken[]): void {
  while (tokens.length > 0) {
    const tok = tokens.shift()!;
    if (tok.v === "]") return;
  }
}

/**
 * Parse a file's text into a TreeEntry with the explicit format. `csvMapping`
 * lets a non-export CSV declare which column plays which role — the column
 * mapper UI stores it on the import source.
 */
export function parseImportFile(
  content: string,
  format: FileImportFormat,
  opts?: { csvMapping?: CsvColumnMap },
): TreeEntry {
  switch (format) {
    case "json":
      return parseJSONGraph(content);
    case "tree":
      return parseASCIITree(content);
    case "script":
      return parseScript(content);
    case "csv":
      return parseCSVGraph(content, opts?.csvMapping);
    case "dot":
      return parseDOTGraph(content);
  }
}