// Client-side URL + GitHub import (T-102): the same builders the server
// routes use (`/api/crawl`, `/api/github-tree`), run in the renderer with
// netFetch — CORS-free in the desktop shell via the host_fetch bridge, and a
// plain fetch on the web (where the endpoints exist but this path is unused).
import { crawlTree, MAX_DEPTH, MAX_PAGES } from "./crawl";
import { buildTree, parseGitHubUrl, subtreeItems, type GitHubTreeItem, type TreeEntry } from "./githubTree";
import { isGitHubUrl } from "./importFlow";
import { netFetch } from "./netFetch";

export interface LocalImportResult {
  tree: TreeEntry;
  truncated: boolean;
}

// Headers: the host bridge sets UA + Accept server-side; the web path never
// uses this module (the /api routes exist there instead).

/**
 * Resolve the actual branch — mirrors `/api/github-tree`'s resolveBranch.
 * "HEAD" means none specified; branch names may contain "/", so shorter
 * splits are probed until one resolves as a valid ref.
 */
async function resolveBranch(
  owner: string,
  repo: string,
  rawBranch: string,
  rawPath: string,
): Promise<{ branch: string; path: string; commitSha: string | null }> {
  const branchesToTry = rawBranch === "HEAD" ? ["main", "master"] : [rawBranch];
  for (const branchBase of branchesToTry) {
    const segments = [branchBase, ...rawPath.split("/").filter(Boolean)];
    for (let i = segments.length; i >= 1; i--) {
      const candidateBranch = segments.slice(0, i).join("/");
      const candidatePath = segments.slice(i).join("/");
      const refRes = await netFetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${candidateBranch}`,
      );
      if (refRes.ok) {
        const refData = await refRes.json();
        const commitSha = refData?.object?.sha ?? null;
        if (commitSha) return { branch: candidateBranch, path: candidatePath, commitSha };
      }
    }
  }
  return { branch: rawBranch, path: rawPath, commitSha: null };
}

/**
 * Import a directory graph from a public file index URL or a GitHub repo URL,
 * entirely client-side. Throws on hard failures (bad repo, API errors); the
 * crawl path returns whatever partial tree the page/depth budget allowed.
 */
export async function importUrlLocal(rawUrl: string): Promise<LocalImportResult> {
  const url = rawUrl.trim();
  const parsed = isGitHubUrl(url) ? parseGitHubUrl(url) : null;
  if (parsed) {
    const { owner, repo, branch, path } = parsed;
    const resolved = await resolveBranch(owner, repo, branch, path);
    if (!resolved.commitSha) {
      throw new Error(
        `Repository ${owner}/${repo} not found (or GitHub's unauthenticated rate limit is exceeded). Check the URL and try again.`,
      );
    }
    const commitRes = await netFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${resolved.commitSha}`,
    );
    if (!commitRes.ok) throw new Error(`GitHub API error (commit, ${commitRes.status})`);
    const commitData = await commitRes.json();
    const treeSha = commitData?.tree?.sha;
    if (!treeSha) throw new Error("Could not resolve repository tree");
    const treeRes = await netFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    );
    if (!treeRes.ok) throw new Error(`GitHub API error (tree, ${treeRes.status})`);
    const treeData = await treeRes.json();
    const { stripped, rootName } = subtreeItems(
      (treeData?.tree ?? []) as GitHubTreeItem[],
      resolved.path,
    );
    const tree = buildTree(owner, repo, resolved.branch, resolved.path, rootName || repo, stripped);
    // The web route drops this field; include it so large repos truncate honestly.
    return { tree, truncated: !!treeData?.truncated };
  }
  return crawlTree(url, MAX_DEPTH, MAX_PAGES);
}
