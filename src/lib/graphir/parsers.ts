import type { TreeEntry } from "./types";

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
    childEntries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      name: nodeData.label,
      type: nodeData.type === "folder" ? "folder" : "file",
      children: childEntries.length > 0 ? childEntries : undefined,
    };
  }

  return buildTree(root.id);
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
  const lines = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));

  if (lines.length === 0) throw new Error("Empty tree text");

  // The first line should be the root
  const firstLine = lines[0].replace(/\/\s*$/, "").trim();
  const root: TreeEntry = {
    name: firstLine,
    type: "folder",
    children: [],
  };

  // Stack to track the current path: [{ entry, depth }]
  const stack: { entry: TreeEntry; depth: number }[] = [{ entry: root, depth: 0 }];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Calculate depth by counting tree characters
    // Each level is typically 4 characters: "│   " or "    "
    const treePart = line.match(/^[\s│├└─]+/);
    let depth = 0;
    let name = line.trim();

    if (treePart) {
      const prefix = treePart[0];
      // Count depth: every 4 chars = 1 level
      depth = Math.floor(prefix.replace(/│/g, " ").length / 4);
      name = line.slice(prefix.length).trim();
    }

    // Remove trailing slash for folders, trailing size annotations
    name = name.replace(/\/\s*$/, "").trim();
    // Remove trailing annotations like " (1.2 KB)" or "·1.2 KB"
    name = name.replace(/\s*[·(].*$/, "").trim();
    // Remove leading bullet if present
    name = name.replace(/^[├└─]\s*/, "").trim();

    if (!name) continue;

    const isFolder = !name.includes(".") || name.endsWith("/");
    const entry: TreeEntry = {
      name,
      type: isFolder ? "folder" : "file",
      children: isFolder ? [] : undefined,
    };

    // Find the parent by walking up the stack
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].entry;
    parent.children = parent.children ?? [];
    parent.children.push(entry);

    if (isFolder) {
      stack.push({ entry, depth });
    }
  }

  // Sort all children recursively
  function sortChildren(entry: TreeEntry) {
    if (!entry.children) return;
    entry.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of entry.children) sortChildren(c);
  }
  sortChildren(root);

  return root;
}

/**
 * Parse a shell script (mkdir -p commands) or batch script (mkdir commands)
 * into a TreeEntry.
 *
 * Example input (shell):
 *   mkdir -p "src/components"
 *   mkdir -p "src/hooks"
 *   mkdir -p "public"
 *
 * Example input (batch):
 *   mkdir "src\components"
 *   mkdir "src\hooks"
 */
export function parseScript(text: string): TreeEntry {
  const lines = text.split("\n").filter((l) => l.trim());

  if (lines.length === 0) throw new Error("Empty script");

  // Detect format
  const isBatch = lines.some((l) => /mkdir\s+/i.test(l) && l.includes("\\"));

  // Extract all paths
  const paths: string[] = [];
  for (const line of lines) {
    // Match mkdir -p "path" or mkdir "path" or mkdir path
    const match = line.match(/mkdir\s+(?:-p\s+)?["']?([^"'\n]+)["']?/i);
    if (match) {
      let path = match[1].trim();
      // Normalize backslashes to forward slashes (batch)
      path = path.replace(/\\/g, "/");
      // Remove trailing slash
      path = path.replace(/\/$/, "");
      if (path) paths.push(path);
    }
  }

  if (paths.length === 0) throw new Error("No mkdir commands found in script");

  // Build tree from paths
  const rootName = paths[0].split("/")[0];
  const root: TreeEntry = {
    name: rootName,
    type: "folder",
    children: [],
  };

  for (const path of paths) {
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

  // Sort children
  function sortChildren(entry: TreeEntry) {
    if (!entry.children) return;
    entry.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of entry.children) sortChildren(c);
  }
  sortChildren(root);

  return root;
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
