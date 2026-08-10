import "server-only";
import { callbackUrl } from "../oauth";
import type { CloudProviderAdapter, CloudEntry, CloudProvider } from "../types";
import type { TreeEntry } from "@/lib/fewer/types";

const CLIENT_ID = () => process.env.MICROSOFT_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.MICROSOFT_CLIENT_SECRET ?? "";
const TENANT = () => process.env.MICROSOFT_TENANT || "common";
const GRAPH = "https://graph.microsoft.com/v1.0";
const DEVOPS = "https://dev.azure.com";
const VSSPS = "https://app.vssps.visualstudio.com";

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "User-Agent": "fewer-app" };
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error_description || data.error || "Microsoft token exchange failed");
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

/** Shared OAuth plumbing; per-provider scope + browse logic injected below. */
function baseAdapter(id: CloudProvider, label: string, scope: string): Pick<CloudProviderAdapter, "id" | "label" | "buildAuthUrl" | "exchangeCode" | "refreshToken"> {
  return {
    id,
    label,

    async buildAuthUrl(state) {
      if (!CLIENT_ID() || !CLIENT_SECRET()) {
        throw new Error("Microsoft is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.");
      }
      const params = new URLSearchParams({
        client_id: CLIENT_ID(),
        response_type: "code",
        redirect_uri: callbackUrl(),
        scope: `${scope} offline_access openid`,
        state,
        prompt: "consent",
      });
      return `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0/authorize?${params.toString()}`;
    },

    async exchangeCode(code) {
      const data = await tokenRequest({
        client_id: CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
        code,
        redirect_uri: callbackUrl(),
        grant_type: "authorization_code",
      });
      // Account identity: Graph /me works for Graph-scoped tokens; DevOps uses its profile API.
      let accountId = "microsoft";
      let accountName = "Microsoft";
      try {
        if (id === "azure-devops") {
          const res = await fetch(`${VSSPS}/_apis/profile/profiles/me?api-version=7.1`, { headers: headers(data.access_token) });
          if (res.ok) {
            const p = await res.json();
            accountId = p.emailAddress || p.displayName || "azure-devops";
            accountName = p.displayName || accountId;
          }
        } else if (id !== "azure-blob") {
          const res = await fetch(`${GRAPH}/me?$select=id,displayName,userPrincipalName,mail`, { headers: headers(data.access_token) });
          if (res.ok) {
            const u = await res.json();
            accountId = u.userPrincipalName || u.mail || u.id;
            accountName = u.displayName || accountId;
          }
        } else {
          const acct = process.env.AZURE_BLOB_STORAGE_ACCOUNT ?? "";
          accountId = acct || "azure-blob";
          accountName = acct ? `${acct} (Azure Blob)` : "Azure Blob";
        }
      } catch {
        /* keep defaults */
      }
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        accountId,
        accountName,
        config: id === "azure-blob" ? { storageAccount: process.env.AZURE_BLOB_STORAGE_ACCOUNT ?? "" } : {},
      };
    },

    async refreshToken(refreshToken) {
      const data = await tokenRequest({
        client_id: CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      return { accessToken: data.access_token, expiresIn: data.expires_in };
    },
  };
}

/* ─────────────────────────── OneDrive (Graph /me/drive) ─────────────────── */

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  folder?: { childCount?: number };
  file?: object;
}

async function graphChildren(token: string, url: string): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let next: string | undefined = `${url}${url.includes("?") ? "&" : "?"}$top=1000`;
  // ponytail: cap at 5 pages per folder
  for (let page = 0; page < 5 && next; page++) {
    const res = await fetch(next, { headers: headers(token) });
    if (!res.ok) throw new Error(`Microsoft Graph error (${res.status})`);
    const data = await res.json();
    items.push(...(data.value ?? []));
    next = data["@odata.nextLink"];
  }
  return items;
}

function itemToEntry(it: DriveItem): CloudEntry {
  return {
    name: it.name,
    type: it.folder ? "folder" : "file",
    size: it.folder ? undefined : it.size,
    webUrl: it.webUrl,
    ref: it.id,
  };
}

async function graphBuildTree(token: string, baseUrl: string, rootName: string, depth: number): Promise<TreeEntry> {
  async function build(url: string, name: string, level: number): Promise<TreeEntry> {
    const node: TreeEntry = { name, type: "folder", children: [] };
    if (level >= depth) return node;
    const items = await graphChildren(token, url);
    for (const it of items) {
      if (it.folder) {
        node.children!.push(await build(`${GRAPH}/me/drive/items/${it.id}/children`, it.name, level + 1));
      } else {
        node.children!.push({ name: it.name, type: "file", size: it.size ?? 0, webUrl: it.webUrl });
      }
    }
    return node;
  }
  return build(baseUrl, rootName, 0);
}

export const onedriveAdapter: CloudProviderAdapter = {
  ...baseAdapter("onedrive", "OneDrive", "Files.Read User.Read"),

  async listChildren(accessToken, ref) {
    const url = ref ? `${GRAPH}/me/drive/items/${ref}/children` : `${GRAPH}/me/drive/root/children`;
    const items = await graphChildren(accessToken, url);
    return { entries: items.map(itemToEntry), rootName: "OneDrive" };
  },

  async buildTree(accessToken, ref, depth) {
    if (ref) {
      const meta = await fetch(`${GRAPH}/me/drive/items/${ref}?$select=name`, { headers: headers(accessToken) });
      const name = meta.ok ? ((await meta.json()).name as string) : "OneDrive folder";
      return graphBuildTree(accessToken, `${GRAPH}/me/drive/items/${ref}/children`, name, depth);
    }
    return graphBuildTree(accessToken, `${GRAPH}/me/drive/root/children`, "OneDrive", depth);
  },
};

/* ─────────────── SharePoint (followed sites → site drives) ─────────────── */

type SpRef = { siteId?: string; itemId?: string };

export const sharepointAdapter: CloudProviderAdapter = {
  ...baseAdapter("sharepoint", "SharePoint", "Sites.Read.All Files.Read User.Read"),

  async listChildren(accessToken, ref) {
    const r: SpRef = ref ? JSON.parse(ref) : {};

    // Root level: list followed sites
    if (!r.siteId) {
      const res = await fetch(`${GRAPH}/me/followed/sites`, { headers: headers(accessToken) });
      if (!res.ok) throw new Error(`Microsoft Graph error (${res.status})`);
      const data = await res.json();
      const sites = (data.value ?? []) as Array<{ id: string; displayName?: string; name?: string; webUrl?: string }>;
      return {
        entries: sites.map((s) => ({
          name: s.displayName || s.name || s.id,
          type: "folder" as const,
          webUrl: s.webUrl,
          ref: JSON.stringify({ siteId: s.id }),
        })),
        rootName: "SharePoint sites",
      };
    }

    // Site level: browse the site's default document library
    const url = r.itemId
      ? `${GRAPH}/sites/${r.siteId}/drive/items/${r.itemId}/children`
      : `${GRAPH}/sites/${r.siteId}/drive/root/children`;
    const items = await graphChildren(accessToken, url);
    return {
      entries: items.map((it) => ({ ...itemToEntry(it), ref: JSON.stringify({ siteId: r.siteId, itemId: it.id }) })),
      rootName: "SharePoint",
    };
  },

  async buildTree(accessToken, ref, depth) {
    const r: SpRef = ref ? JSON.parse(ref) : {};
    if (!r.siteId) throw new Error("Pick a SharePoint site first");

    const siteRes = await fetch(`${GRAPH}/sites/${r.siteId}?$select=displayName,name`, { headers: headers(accessToken) });
    const siteName = siteRes.ok ? ((await siteRes.json()).displayName as string) : "SharePoint site";

    async function build(url: string, name: string, itemId: string | undefined, level: number): Promise<TreeEntry> {
      const node: TreeEntry = { name, type: "folder", children: [] };
      if (level >= depth) return node;
      const items = await graphChildren(accessToken, url);
      for (const it of items) {
        if (it.folder) {
          node.children!.push(
            await build(`${GRAPH}/sites/${r.siteId}/drive/items/${it.id}/children`, it.name, it.id, level + 1),
          );
        } else {
          node.children!.push({ name: it.name, type: "file", size: it.size ?? 0, webUrl: it.webUrl });
        }
      }
      return node;
    }

    if (r.itemId) {
      const meta = await fetch(`${GRAPH}/sites/${r.siteId}/drive/items/${r.itemId}?$select=name`, { headers: headers(accessToken) });
      const folderName = meta.ok ? ((await meta.json()).name as string) : siteName;
      return build(`${GRAPH}/sites/${r.siteId}/drive/items/${r.itemId}/children`, folderName, r.itemId, 0);
    }
    return build(`${GRAPH}/sites/${r.siteId}/drive/root/children`, siteName, undefined, 0);
  },
};

/* ─────────────────────── Azure DevOps (git repos) ───────────────────────── */

type DoRef = { org?: string; projectId?: string; projectName?: string; repoId?: string; repoName?: string; path?: string };

async function devopsJson(token: string, url: string) {
  const res = await fetch(url, { headers: { ...headers(token), Accept: "application/json" } });
  if (!res.ok) throw new Error(`Azure DevOps error (${res.status})`);
  return res.json();
}

export const azureDevOpsAdapter: CloudProviderAdapter = {
  ...baseAdapter("azure-devops", "Azure DevOps", "499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"),

  async listChildren(accessToken, ref) {
    const r: DoRef = ref ? JSON.parse(ref) : {};

    // Root: organizations the user belongs to
    if (!r.org) {
      const data = await devopsJson(accessToken, `${VSSPS}/_apis/accounts?api-version=7.1`);
      const accounts = (data.value ?? data) as Array<{ AccountName: string; AccountId: string }>;
      return {
        entries: accounts.map((a) => ({
          name: a.AccountName,
          type: "folder" as const,
          ref: JSON.stringify({ org: a.AccountName }),
        })),
        rootName: "Azure DevOps orgs",
      };
    }

    // Org: projects
    if (!r.projectId) {
      const data = await devopsJson(accessToken, `${DEVOPS}/${r.org}/_apis/projects?$top=200&api-version=7.1`);
      return {
        entries: ((data.value ?? []) as Array<{ id: string; name: string }>).map((p) => ({
          name: p.name,
          type: "folder" as const,
          webUrl: `https://dev.azure.com/${r.org}/${encodeURIComponent(p.name)}`,
          ref: JSON.stringify({ org: r.org, projectId: p.id, projectName: p.name }),
        })),
        rootName: r.org,
      };
    }

    // Project: git repos
    if (!r.repoId) {
      const data = await devopsJson(accessToken, `${DEVOPS}/${r.org}/${r.projectId}/_apis/git/repositories?api-version=7.1`);
      return {
        entries: ((data.value ?? []) as Array<{ id: string; name: string }>).map((repo) => ({
          name: repo.name,
          type: "folder" as const,
          webUrl: `https://dev.azure.com/${r.org}/${encodeURIComponent(r.projectName ?? "")}/_git/${encodeURIComponent(repo.name)}`,
          ref: JSON.stringify({ org: r.org, projectId: r.projectId, projectName: r.projectName, repoId: repo.id, repoName: repo.name }),
        })),
        rootName: r.projectName ?? "project",
      };
    }

    // Repo: items at path (oneLevel includes the folder itself — filter it out)
    const scopePath = r.path || "/";
    const data = await devopsJson(
      accessToken,
      `${DEVOPS}/${r.org}/${r.projectId}/_apis/git/repositories/${r.repoId}/items?scopePath=${encodeURIComponent(scopePath)}&recursionLevel=oneLevel&api-version=7.1`,
    );
    const items = (data.value ?? []) as Array<{ path: string; isFolder: boolean; size?: number }>;
    return {
      entries: items
        .filter((it) => it.path !== scopePath && it.path !== "/")
        .map((it) => ({
          name: it.path.split("/").pop()!,
          type: it.isFolder ? ("folder" as const) : ("file" as const),
          size: it.isFolder ? undefined : it.size,
          webUrl: `https://dev.azure.com/${r.org}/${encodeURIComponent(r.projectName ?? "")}/_git/${encodeURIComponent(r.repoName ?? "")}?path=${encodeURIComponent(it.path)}`,
          ref: it.isFolder
            ? JSON.stringify({ ...r, path: it.path })
            : undefined,
        })),
      rootName: r.repoName ?? "repo",
    };
  },

  async buildTree(accessToken, ref, depth) {
    const r: DoRef = ref ? JSON.parse(ref) : {};
    if (!r.org || !r.projectId || !r.repoId) throw new Error("Pick an Azure DevOps repo first");

    const scopePath = r.path || "/";
    // ponytail: recursionLevel=full returns the whole subtree in one call; depth
    // filtering happens client-side via the import options. Ceiling: huge repos.
    const data = await devopsJson(
      accessToken,
      `${DEVOPS}/${r.org}/${r.projectId}/_apis/git/repositories/${r.repoId}/items?scopePath=${encodeURIComponent(scopePath)}&recursionLevel=full&api-version=7.1`,
    );
    const items = ((data.value ?? []) as Array<{ path: string; isFolder: boolean; size?: number }>).filter(
      (it) => it.path !== scopePath && it.path !== "/",
    );

    const rootName = scopePath === "/" ? r.repoName ?? "repo" : scopePath.split("/").pop()!;
    const root: TreeEntry = { name: rootName, type: "folder", children: [] };
    const map = new Map<string, TreeEntry>();
    map.set("/", root);

    const base = scopePath === "/" ? "/" : `${scopePath}/`;
    const sorted = [...items].sort((a, b) => a.path.length - b.path.length);
    for (const item of sorted) {
      const rel = item.path.startsWith(base) ? item.path.slice(base.length) : item.path.replace(/^\//, "");
      if (!rel) continue;
      const parts = rel.split("/");
      const nm = parts.pop()!;
      const parentRel = parts.join("/");
      const parent = map.get(parentRel ? `${base === "/" ? "/" : base}${parentRel}` : "/") ?? map.get(`/${parentRel}`) ?? root;
      const webUrl = `https://dev.azure.com/${r.org}/${encodeURIComponent(r.projectName ?? "")}/_git/${encodeURIComponent(r.repoName ?? "")}?path=${encodeURIComponent(item.path)}`;
      if (item.isFolder) {
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

/* ─────────────────── Azure Blob (containers + prefixes) ─────────────────── */

type BlobRef = { container?: string; prefix?: string };

function storageAccount(): string {
  const acct = process.env.AZURE_BLOB_STORAGE_ACCOUNT ?? "";
  if (!acct) throw new Error("AZURE_BLOB_STORAGE_ACCOUNT is not set");
  return acct;
}

/** Minimal XML extraction — no parser dependency (ponytail). */
function xmlTags(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

async function blobXml(token: string, url: string): Promise<string> {
  const res = await fetch(url, { headers: { ...headers(token), "x-ms-version": "2020-10-02" } });
  if (!res.ok) throw new Error(`Azure Blob error (${res.status})`);
  return res.text();
}

export const azureBlobAdapter: CloudProviderAdapter = {
  ...baseAdapter("azure-blob", "Azure Blob", "https://storage.azure.com/.default"),

  async listChildren(accessToken, ref) {
    const acct = storageAccount();
    const r: BlobRef = ref ? JSON.parse(ref) : {};

    // Root: containers
    if (!r.container) {
      const xml = await blobXml(accessToken, `https://${acct}.blob.core.windows.net/?comp=list&maxresults=1000`);
      const containers = xmlTags(xml, "Container").map((c) => xmlTags(c, "Name")[0]);
      return {
        entries: containers.map((name) => ({
          name,
          type: "folder" as const,
          ref: JSON.stringify({ container: name, prefix: "" }),
        })),
        rootName: acct,
      };
    }

    // Container/prefix: blobs + virtual dirs via delimiter
    const prefixParam = r.prefix ? `&prefix=${encodeURIComponent(r.prefix)}` : "";
    const xml = await blobXml(
      accessToken,
      `https://${acct}.blob.core.windows.net/${r.container}?restype=container&comp=list&delimiter=/${prefixParam}&maxresults=1000`,
    );
    const dirs = xmlTags(xml, "BlobPrefix").map((p) => xmlTags(p, "Name")[0]);
    const blobs = xmlTags(xml, "Blob").map((b) => ({
      name: xmlTags(b, "Name")[0],
      size: Number(xmlTags(b, "Content-Length")[0] || 0),
    }));

    const entries: CloudEntry[] = [
      ...dirs.map((d) => ({
        name: d.replace(/\/$/, "").split("/").pop()!,
        type: "folder" as const,
        ref: JSON.stringify({ container: r.container, prefix: d }),
      })),
      ...blobs.map((b) => ({
        name: b.name.split("/").pop()!,
        type: "file" as const,
        size: b.size,
        webUrl: `https://${acct}.blob.core.windows.net/${r.container}/${b.name}`,
      })),
    ];
    return { entries, rootName: r.container };
  },

  async buildTree(accessToken, ref, depth) {
    const acct = storageAccount();
    const r: BlobRef = ref ? JSON.parse(ref) : {};
    if (!r.container) throw new Error("Pick a storage container first");

    async function build(prefix: string, name: string, level: number): Promise<TreeEntry> {
      const node: TreeEntry = { name, type: "folder", children: [] };
      if (level >= depth) return node;
      const prefixParam = prefix ? `&prefix=${encodeURIComponent(prefix)}` : "";
      const xml = await blobXml(
        accessToken,
        `https://${acct}.blob.core.windows.net/${r.container}?restype=container&comp=list&delimiter=/${prefixParam}&maxresults=1000`,
      );
      for (const p of xmlTags(xml, "BlobPrefix").map((x) => xmlTags(x, "Name")[0])) {
        node.children!.push(await build(p, p.replace(/\/$/, "").split("/").pop()!, level + 1));
      }
      for (const b of xmlTags(xml, "Blob")) {
        const bName = xmlTags(b, "Name")[0];
        node.children!.push({
          name: bName.split("/").pop()!,
          type: "file",
          size: Number(xmlTags(b, "Content-Length")[0] || 0),
          webUrl: `https://${acct}.blob.core.windows.net/${r.container}/${bName}`,
        });
      }
      return node;
    }

    const startName = r.prefix ? r.prefix.replace(/\/$/, "").split("/").pop()! : r.container;
    return build(r.prefix ?? "", startName, 0);
  },
};