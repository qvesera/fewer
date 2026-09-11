import { NextResponse } from "next/server";
import { serverError } from "@/lib/fewer/apiHelpers";
import {
  buildTree,
  parseGitHubUrl,
  subtreeItems,
  type GitHubTreeItem,
} from "@/lib/fewer/githubTree";

const GH_HEADERS = { "User-Agent": "fewer-app", Accept: "application/vnd.github.v3+json" };
const GH_UA = { "User-Agent": "fewer-app" };

/**
 * Resolve the actual branch name — "HEAD" means none was specified in the URL.
 * Branch names can contain "/" (e.g. "fix/canvas-shortcuts"), so we try
 * progressively shorter branch splits until one resolves as a valid ref.
 * For "a/b/c" after "tree": try "a/b/c"+"", "a/b"+"c", "a"+"b/c".
 * When no branch was specified, common branch names are tried first.
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
      const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${candidateBranch}`, { headers: GH_HEADERS });
      if (refRes.ok) {
        const refData = await refRes.json();
        const commitSha = refData.object?.sha ?? null;
        if (commitSha) return { branch: candidateBranch, path: candidatePath, commitSha };
      }
    }
  }
  return { branch: rawBranch, path: rawPath, commitSha: null };
}

/** No ref resolved: distinguish rate limiting (429) from a bad repo (404). */
async function rateLimitOrNotFound(owner: string, repo: string): Promise<NextResponse> {
  const checkRes = await fetch(`https://api.github.com/rate_limit`, { headers: GH_UA });
  const rateData = await checkRes.json();
  const remaining = rateData?.rate?.remaining ?? 0;
  if (remaining === 0) {
    return NextResponse.json({ error: "GitHub API rate limit exceeded. Try again in about an hour." }, { status: 429 });
  }
  return NextResponse.json({ error: `Repository ${owner}/${repo} not found. Check the URL and try again.` }, { status: 404 });
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
    const { owner, repo } = parsed;

    const { branch: actualBranch, path: actualPath, commitSha } = await resolveBranch(owner, repo, parsed.branch, parsed.path);
    if (!commitSha) {
      return await rateLimitOrNotFound(owner, repo);
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

    const { stripped, rootName } = subtreeItems(treeData.tree || [], actualPath);
    const root = buildTree(owner, repo, actualBranch, actualPath, rootName || repo, stripped);

    return NextResponse.json({ tree: root, repo: `${owner}/${repo}`, branch: actualBranch });
  } catch (err) {
    return serverError(err);
  }
}