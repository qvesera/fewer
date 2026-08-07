import "server-only";
import { callbackUrl } from "../oauth";
import type { CloudProviderAdapter, CloudEntry } from "../types";
import type { TreeEntry } from "@/lib/fewer/types";

const CLIENT_ID = () => process.env.GITHUB_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET ?? "";
const AUTH_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

function ghHeaders(token: string, accept = "application/vnd.github.v3+json") {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "User-Agent": "fewer-app",
  };
}

interface GhTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

interface GhContentItem {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  html_url?: string;
}

/**
 * Refs:
 *   undefined            → list the user's repositories
 *   "owner/repo"         → repo root (default branch)
 *   "owner/repo/branch[/path…]" → branch may itself contain "/"
 */
function parseRef(ref: string): { owner: string; name: string; rest: string[] } {
  const parts = ref.split("/");
  return { owner: parts[0], name: parts[1], rest: parts.slice(2) };
}

export const githubAdapter: CloudProviderAdapter = {
  id: "github",
  label: "GitHub",

  async buildAuthUrl(state) {
    if (!CLIENT_ID() || !CLIENT_SECRET()) {
      throw new Error("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
    }
    const scope = encodeURIComponent("repo");
    const clientId = CLIENT_ID();
    const redirect = encodeURIComponent(callbackUrl());
    return `${AUTH_URL}?client_id=${clientId}&redirect_uri=${redirect}&scope=${scope}&state=${state}`;
  },

  async exchangeCode(code) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
        code,
        redirect_uri: callbackUrl(),
      }),
    });
    if (!res.ok) throw new Error("GitHub token exchange failed");
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    const accessToken = data.access_token as string;

    const me = await fetch(`${API}/user`, { headers: ghHeaders(accessToken) });
    if (!me.ok) throw new Error("Could not fetch GitHub user");
    const user = await me.json();
    return {
      accessToken,
      refreshToken: undefined,
      accountId: String(user.login),
      accountName: user.login as string,
      config: { login: user.login, name: user.name || user.login },
    };
  },

  async refreshToken() {
    // GitHub tokens do not expire (unless revoked). No refresh flow.
    return null;
  },

  async listChildren(accessToken, ref) {
    // Root: list the user's repositories
    if (!ref) {
      const res = await fetch(`${API}/user/repos?per_page=100&sort=updated`, { headers: ghHeaders(accessToken) });
      if (!res.ok) throw new Error("GitHub API error (repos)");
      const repos: Array<{ full_name: string; html_url: string; private: boolean }> = await res.json();
      return {
        entries: repos.map((r) => ({
          name: r.full_name,
          type: "folder" as const,
          webUrl: r.html_url,
          ref: r.full_name,
        })),
        rootName: "GitHub",
      };
    }

    const { owner, name, rest } = parseRef(ref);
    if (!owner || !name) throw new Error("Invalid GitHub ref");

    // Resolve branch + path. At the repo root, use the default branch.
    let branch: string;
    let path: string;
    if (rest.length === 0) {
      const repoRes = await fetch(`${API}/repos/${owner}/${name}`, { headers: ghHeaders(accessToken) });
      if (!repoRes.ok) throw new Error("GitHub API error (repo)");
      branch = ((await repoRes.json()).default_branch as string) || "main";
      path = "";
    } else {
      const resolved = await resolveBranchPath(accessToken, owner, name, rest[0], rest.slice(1).join("/"));
      if (!resolved) throw new Error("Could not resolve GitHub branch/path");
      branch = resolved.branch;
      path = resolved.path;
    }

    const contentUrl = `${API}/repos/${owner}/${name}/contents${path ? `/${path}` : ""}?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(contentUrl, { headers: ghHeaders(accessToken) });
    if (!res.ok) throw new Error("GitHub API error (contents)");
    const raw = await res.json();
    const items: GhContentItem[] = Array.isArray(raw) ? raw : [raw];

    return {
      entries: items.map((it) => ({
        name: it.name,
        type: it.type === "dir" ? ("folder" as const) : ("file" as const),
        size: it.type === "file" ? it.size : undefined,
        webUrl: it.html_url,
        ref: it.type === "dir" ? `${owner}/${name}/${branch}/${it.path}` : undefined,
      })),
      rootRef: `${owner}/${name}`,
      rootName: path.split("/").pop() || name,
    };
  },

  async buildTree(accessToken, ref, depth) {
    const { owner, name, rest } = parseRef(ref);
    if (!owner || !name) throw new Error("Invalid GitHub ref");

    let branch = rest[0];
    let path = rest.slice(1).join("/");
    if (!branch) {
      const repoRes = await fetch(`${API}/repos/${owner}/${name}`, { headers: ghHeaders(accessToken) });
      if (!repoRes.ok) throw new Error("GitHub API error (repo)");
      branch = ((await repoRes.json()).default_branch as string) || "main";
      path = "";
    }
    const resolved = await resolveBranchPath(accessToken, owner, name, branch, path);
    if (!resolved) throw new Error("Could not resolve GitHub branch/path");
    const { commitSha } = resolved;

    const treeRes = await fetch(`${API}/repos/${owner}/${name}/git/trees/${commitSha}?recursive=1`, { headers: ghHeaders(accessToken) });
    if (!treeRes.ok) throw new Error("GitHub API error (tree)");
    const treeData = await treeRes.json();
    const items: GhTreeItem[] = treeData.tree || [];

    const rootPath = resolved.path;
    const rootName = rootPath.split("/").pop() || name;
    const root: TreeEntry = { name: rootName, type: "folder", children: [] };
    const map = new Map<string, TreeEntry>();
    map.set("", root);

    const prefix = rootPath ? `${rootPath}/` : "";
    const filtered = rootPath ? items.filter((i) => i.path === rootPath || i.path.startsWith(prefix)) : items;
    const stripped = rootPath
      ? filtered.map((i) => ({
          ...i,
          path: i.path === rootPath ? "." : i.path.slice(prefix.length),
        }))
      : filtered;

    // ponytail: depth cap applied here to bound huge repos (upgrade: stream/paginate)
    const sorted = [...stripped].sort((a, b) => a.path.length - b.path.length);
    for (const item of sorted) {
      if (item.path === ".") continue;
      const parts = item.path.split("/");
      if (depth > 0 && parts.length > depth) continue;
      const nm = parts.pop()!;
      const parentPath = parts.join("/");
      const parent = map.get(parentPath);
      if (!parent) continue;
      const webUrl = `https://github.com/${owner}/${name}/tree/${resolved.branch}/${rootPath ? rootPath + "/" + item.path : item.path}`;
      if (item.type === "tree") {
        const dir: TreeEntry = { name: nm, type: "folder", children: [], webUrl };
        parent.children = parent.children || [];
        parent.children.push(dir);
        map.set(item.path, dir);
      } else {
        parent.children = parent.children || [];
        parent.children.push({ name: nm, type: "file", size: item.size ?? 0, webUrl });
      }
    }
    return root;
  },
};

/** Resolve a branch + path (branch may contain "/") to a commit SHA. */
async function resolveBranchPath(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<{ commitSha: string; branch: string; path: string } | null> {
  const branchesToTry = branch ? [branch] : ["main", "master"];
  for (const base of branchesToTry) {
    const segments = [base, ...path.split("/").filter(Boolean)];
    for (let i = segments.length; i >= 1; i--) {
      const candidate = segments.slice(0, i).join("/");
      const rem = segments.slice(i).join("/");
      const res = await fetch(`${API}/repos/${owner}/${repo}/git/refs/heads/${candidate}`, { headers: ghHeaders(accessToken) });
      if (res.ok) {
        const data = await res.json();
        const sha = data.object?.sha as string | undefined;
        if (sha) return { commitSha: sha, branch: candidate, path: rem };
      }
    }
  }
  return null;
}