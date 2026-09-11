import type { TreeEntry } from "./types";
import { FEWER_CREDIT_RE, TREE_HEADER, TREE_SUMMARY_RE } from "./branding";

/**
 * Parse a JSON graph export back into a TreeEntry.
 * The JSON format is the one produced by exportUtils.ts exportJSON().
 */
export function parseJSONGraph(json: string): TreeEntry {
  const data = JSON.parse(json);
  if (!data.nodes || !Array.isArray(data.nodes)) {
    throw new Error("Invalid JSON: missing 'nodes' array");
  }

  // Build a map of node IDs to node data
  const nodeMap = new Map<string, { label: string; type: string; path: string }>();
  for (const node of data.nodes) {
    nodeMap.set(node.id, {
      label: node.label,
      type: node.type,
      path: node.path,
    });
  }

  // Build child map from edges
  const childMap = new Map<string | null, string[]>();
  const hasParent = new Set<string>();
  for (const edge of data.edges || []) {
    const children = childMap.get(edge.source) ?? [];
    children.push(edge.target);
    childMap.set(edge.source, children);
    hasParent.add(edge.target);
  }

  // Find root nodes (no parent)
  const roots = data.nodes.filter((n: { id: string }) => !hasParent.has(n.id));
  if (roots.length === 0) throw new Error("No root node found in JSON");
  const root = roots[0];

  // Recursively build tree
  function buildTree(nodeId: string): TreeEntry {
    const nodeData = nodeMap.get(nodeId);
    if (!nodeData) throw new Error(`Node ${nodeId} not found`);

    const children = childMap.get(nodeId) ?? [];
    const childEntries = children.map(buildTree);

    // Sort: folders first, then alphabetical
    sortFoldersFirst(childEntries);

    return {
      name: nodeData.label,
      type: nodeData.type === "folder" ? "folder" : "file",
      children: childEntries.length > 0 ? childEntries : undefined,
    };
  }

  return buildTree(root.id);
}

/** Sort a children array: folders first, then alphabetical. */
function sortFoldersFirst(children: TreeEntry[]): void {
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Sort a whole tree: folders first, then alphabetical (recursive). */
function sortTreeFoldersFirst(entry: TreeEntry): void {
  if (!entry.children) return;
  sortFoldersFirst(entry.children);
  for (const c of entry.children) sortTreeFoldersFirst(c);
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
    const { name, depth } = entries[i];
    const folder = isFolder[i];
    const entry: TreeEntry = {
      name,
      type: folder ? "folder" : "file",
      children: folder ? [] : undefined,
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

/** One raw ASCII-tree line: name, tree depth, and whether the name ends with "/". */
interface RawEntry {
  name: string;
  depth: number;
  hasSlash: boolean;
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

    // Remove trailing slash for folders, trailing size annotations
    const hasSlash = name.endsWith("/");
    name = name.replace(/\/\s*$/, "").trim();
    // Remove trailing annotations like " (1.2 KB)" or "·1.2 KB"
    name = name.replace(/\s*[·(].*$/, "").trim();
    // Remove leading bullet if present
    name = name.replace(/^[├└─]\s*/, "").trim();

    if (!name) continue;

    entries.push({ name, depth, hasSlash });
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

/**
 * Auto-detect the format and parse accordingly.
 */
export function parseImportFile(content: string, format: "json" | "tree" | "script"): TreeEntry {
  switch (format) {
    case "json":
      return parseJSONGraph(content);
    case "tree":
      return parseASCIITree(content);
    case "script":
      return parseScript(content);
  }
}