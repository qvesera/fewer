import { NextResponse } from "next/server";

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

interface TreeEntry {
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
function parseGitHubUrl(url: string): { owner: string; repo: string; branch: string; path: string } | null {
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

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing or invalid URL" }, { status: 400 });
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid GitHub URL. Use format: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path" }, { status: 400 });
    }

    const { owner, repo, branch: rawBranch, path: rawPath } = parsed;

    // Resolve the actual branch name — "HEAD" means none was specified in URL
    let actualBranch = rawBranch;
    let actualPath = rawPath;

    // Branch names can contain "/" (e.g. "fix/canvas-shortcuts"), so we try
    // progressively shorter branch splits until one resolves as a valid ref.
    // For "a/b/c" after "tree": try "a/b/c"+"", "a/b"+"c", "a"+"b/c"
    let commitSha: string | null = null;
    {
      // When no branch was specified, try common branch names
      const branchesToTry = actualBranch === "HEAD" ? ["main", "master"] : [actualBranch];
      for (const branchBase of branchesToTry) {
        const segments = [branchBase, ...actualPath.split("/").filter(Boolean)];
        for (let i = segments.length; i >= 1; i--) {
          const candidateBranch = segments.slice(0, i).join("/");
          const candidatePath = segments.slice(i).join("/");
          const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${candidateBranch}`, {
            headers: { "User-Agent": "fewer-app", Accept: "application/vnd.github.v3+json" },
          });
          if (refRes.ok) {
            const refData = await refRes.json();
            commitSha = refData.object?.sha ?? null;
            if (commitSha) {
              actualBranch = candidateBranch;
              actualPath = candidatePath;
              break;
            }
          }
          // Stop trying splits for this branch once we find a working one
          if (commitSha) break;
        }
        if (commitSha) break;
      }
    }

    if (!commitSha) {
      // Check if rate limited
      const checkRes = await fetch(`https://api.github.com/rate_limit`, {
        headers: { "User-Agent": "fewer-app" },
      });
      const rateData = await checkRes.json();
      const remaining = rateData?.rate?.remaining ?? 0;
      if (remaining === 0) {
        return NextResponse.json({ error: "GitHub API rate limit exceeded. Try again in about an hour." }, { status: 429 });
      }
      return NextResponse.json({ error: `Repository ${owner}/${repo} not found. Check the URL and try again.` }, { status: 404 });
    }

    // Get the commit tree SHA
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`, {
      headers: { "User-Agent": "fewer-app", Accept: "application/vnd.github.v3+json" },
    });
    if (!commitRes.ok) {
      return NextResponse.json({ error: "GitHub API error (commit)" }, { status: commitRes.status });
    }
    const commitData = await commitRes.json();
    const treeSha = commitData.tree?.sha;
    if (!treeSha) {
      return NextResponse.json({ error: "Could not resolve tree" }, { status: 500 });
    }

    // Fetch the full recursive tree
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, {
      headers: { "User-Agent": "fewer-app", Accept: "application/vnd.github.v3+json" },
    });
    if (!treeRes.ok) {
      return NextResponse.json({ error: "GitHub API error (tree)" }, { status: treeRes.status });
    }
    const treeData = await treeRes.json();
    const items: GitHubTreeItem[] = treeData.tree || [];

    // Filter to only items under the requested path
    const filtered = actualPath ? items.filter((item) => item.path === actualPath || item.path.startsWith(actualPath + "/")) : items;

    // Remove the root path prefix from all items
    const stripped = actualPath ? filtered.map((item) => ({
      ...item,
      path: item.path === actualPath ? "." : item.path.slice(actualPath.length + 1),
    })) : filtered;

    const rootName = actualPath ? actualPath.split("/").pop()! : repo;

    // Build a GitHub web URL (tree view for folders, blob view for files) rooted
    // at the requested branch/folder. Branch names can contain "/" and arbitrary
    // chars, so each segment is encoded individually to keep the paths valid.
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

    return NextResponse.json({ tree: root, repo: `${owner}/${repo}`, branch: actualBranch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}