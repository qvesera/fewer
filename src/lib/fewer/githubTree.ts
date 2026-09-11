/**
 * Pure GitHub-tree assembly: URL parsing, subfolder filtering, and nested
 * TreeEntry construction. Fetching lives in the /api/github-tree route.
 */

export interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface TreeEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
  webUrl?: string;
  children?: TreeEntry[];
}

/**
 * Parse a GitHub URL and return owner, repo, branch, and path.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   https://github.com/owner/repo/tree/branch/path/to/dir
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string; branch: string; path: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\/|\/$/g, "").split("/");
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    // Default branch
    let branch = "HEAD";
    let path = "";
    if (parts[2] === "tree" && parts.length >= 4) {
      branch = parts[3];
      path = parts.slice(4).join("/");
    }
    return { owner, repo, branch, path };
  } catch {
    return null;
  }
}

/** Filter the recursive tree items down to the requested subfolder and strip
 *  its prefix (pure). "." marks the subfolder root itself. */
export function subtreeItems(
  items: GitHubTreeItem[],
  actualPath: string,
): { stripped: GitHubTreeItem[]; rootName: string } {
  const filtered = actualPath
    ? items.filter((item) => item.path === actualPath || item.path.startsWith(actualPath + "/"))
    : items;
  const stripped = actualPath
    ? filtered.map((item) => ({
        ...item,
        path: item.path === actualPath ? "." : item.path.slice(actualPath.length + 1),
      }))
    : filtered;
  const rootName = actualPath ? actualPath.split("/").pop()! : "";
  return { stripped, rootName };
}

/**
 * Assemble the nested TreeEntry from the stripped, path-prefixed items (pure).
 * Each segment is encoded individually — branch names can contain "/" and
 * arbitrary chars, so segment-wise encoding keeps the paths valid.
 */
export function buildTree(
  owner: string,
  repo: string,
  actualBranch: string,
  actualPath: string,
  rootName: string,
  stripped: GitHubTreeItem[],
): TreeEntry {
  const enc = (s: string) => s.split("/").map(encodeURIComponent).join("/");
  const encBranch = enc(actualBranch);
  const repoRelPath = (p: string) =>
    actualPath ? [actualPath, p].filter(Boolean).join("/") : p;

  const root: TreeEntry = {
    name: rootName,
    type: "folder",
    children: [],
    webUrl: `https://github.com/${owner}/${repo}/tree/${encBranch}${
      actualPath ? "/" + enc(actualPath) : ""
    }`,
  };
  const map = new Map<string, TreeEntry>();
  map.set("", root);

  const sorted = [...stripped].sort((a, b) => a.path.length - b.path.length);

  for (const item of sorted) {
    if (item.path === ".") continue;
    const parts = item.path.split("/");
    const name = parts.pop()!;
    const parentPath = parts.join("/");
    const parent = map.get(parentPath);
    if (!parent) continue;

    // item.path is relative to the requested subfolder; the GitHub URL needs
    // the path relative to the repo root.
    const relPath = repoRelPath(item.path);
    if (item.type === "tree") {
      const dir: TreeEntry = {
        name,
        type: "folder",
        children: [],
        webUrl: `https://github.com/${owner}/${repo}/tree/${encBranch}/${enc(relPath)}`,
      };
      parent.children = parent.children || [];
      parent.children.push(dir);
      map.set(item.path, dir);
    } else {
      parent.children = parent.children || [];
      parent.children.push({
        name,
        type: "file",
        size: item.size ?? 0,
        webUrl: `https://github.com/${owner}/${repo}/blob/${encBranch}/${enc(relPath)}`,
      });
    }
  }

  return root;
}
