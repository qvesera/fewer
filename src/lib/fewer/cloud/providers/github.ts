import "server-only";
import { callbackUrl } from "../oauth";
import type { CloudProviderAdapter, CloudEntry, CloudListResult } from "../types";
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

/** Parse owner/repo out of a repo ref like "owner/repo". */
function parseRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
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
    // ref = "owner/repo" or "owner/repo/branch/path"
    if (!ref) throw new Error("GitHub requires a repo ref");
    const [repo, ...rest] = ref.split("/");
    const { owner, repo: name } = parseRepo(repo!);
    const path = rest.join("/");
    const branch = rest[0];

    // If a branch/path was given, resolve the tree for that branch, else use default.
    const entries: CloudEntry[] = [];
    if (rest.length === 0) {
      // Root of repo: list default branch via contents API
      const res = await fetch(`${API}/repos/${owner}/${name}/contents?ref=HEAD`, { headers: ghHeaders(accessToken) });
      if (!res.ok) throw new Error("GitHub API error (contents)");
      const items: Array<{ name: string; type: "dir" | "file"; size?: number }> = await res.json();
      for (const it of items) {
        entries.push({
          name: it.name,
          type: it.type === "dir" ? "folder" : "file",
          size: it.type === "file" ? it.size : undefined,
          webUrl: `https://github.com/${owner}/${name}/tree/HEAD/${it.name}`.replace(/\/tree\/HEAD\/$/, `/tree/HEAD`),
        });
      }
      return { entries, rootRef: `${owner}/${name}`, rootName: name };
    }

    // Branch-provided: use git tree resolution (branch may contain "/")
    // Resolve branch + path progressively.
    const resolved = await resolveBranchPath(accessToken, owner, name, branch, path);
    if (!resolved) throw new Error("Could not resolve GitHub branch/path");
    const { commitSha, branch: actBranch, path: actPath } = resolved;

    const treeRes = await fetch(`${API}/repos/${owner}/${name}/git/trees/${commitSha}?recursive=1`, { headers: ghHeaders(accessToken) });
    if (!treeRes.ok) throw new Error("GitHub API error (tree)");
    const treeData = await treeRes.json();
    const items: GhTreeItem[] = treeData.tree || [];

    const prefix = actPath ? `${actPath}/` : "";
    const direct = new Map<string, GhTreeItem>();
    for (const item of items) {
      if (item.path === actPath) continue;
      if (!actPath ? item.path.includes("/") : item.path.startsWith(prefix)) {
        const rel = actPath ? item.path.slice(actPath.length + 1) : item.path;
        const top = rel.split("/")[0];
        if (top && !direct.has(top)) direct.set(top, { ...item, path: `${actPath ? actPath + "/" : ""}${top}` });
      }
    }

    for (const item of direct.values()) {
      const isDir = item.type === "tree";
      entries.push({
        name: item.path.split("/").pop()!,
        type: isDir ? "folder" : "file",
        size: isDir ? undefined : item.size,
        webUrl: `https://github.com/${owner}/${name}/tree/${actBranch}/${item.path}`,
      });
    }
    return {
      entries,
      rootRef: `${owner}/${name}/${actBranch}${actPath ? "/" + actPath : ""}`,
      rootName: actPath.split("/").pop() || name,
    };
  },

  async buildTree(accessToken, ref, depth) {
    const [repo, ...rest] = ref.split("/");
    const { owner, repo: name } = parseRepo(repo!);
    const branch = rest[0];
    const path = rest.slice(1).join("/");

    const resolved = await resolveBranchPath(accessToken, owner, name, branch, path);
    if (!resolved) throw new Error("Could not resolve GitHub branch/path");
    const { commitSha } = resolved;

    const treeRes = await fetch(`${API}/repos/${owner}/${name}/git/trees/${commitSha}?recursive=1`, { headers: ghHeaders(accessToken) });
    if (!treeRes.ok) throw new Error("GitHub API error (tree)");
    const treeData = await treeRes.json();
    const items: GhTreeItem[] = treeData.tree || [];

    const rootName = path.split("/").pop() || name;
    const root: TreeEntry = { name: rootName, type: "folder", children: [] };
    const map = new Map<string, TreeEntry>();
    map.set("", root);

    const prefix = path ? `${path}/` : "";
    const filtered = path ? items.filter((i) => i.path === path || i.path.startsWith(prefix)) : items;
    const stripped = path
      ? filtered.map((i) => ({
          ...i,
          path: i.path === path ? "." : i.path.slice(prefix.length),
        }))
      : filtered;

    const sorted = [...stripped].sort((a, b) => a.path.length - b.path.length);
    for (const item of sorted) {
      if (item.path === ".") continue;
      const parts = item.path.split("/");
      const nm = parts.pop()!;
      const parentPath = parts.join("/");
      const parent = map.get(parentPath);
      if (!parent) continue;
      const webUrl = `https://github.com/${owner}/${name}/tree/${resolved.branch}/${path ? path + "/" + item.path : item.path}`;
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