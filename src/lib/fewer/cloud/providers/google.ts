import "server-only";
import { callbackUrl } from "../oauth";
import type { CloudProviderAdapter, CloudEntry } from "../types";
import type { TreeEntry } from "@/lib/fewer/types";

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET ?? "";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "User-Agent": "fewer-app" };
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
}

async function exchange(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error_description || data.error || "Google token exchange failed");
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

/** List one folder page-set (handles pagination, capped). */
async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  // ponytail: cap at 5 pages (5000 entries) per folder — upgrade by raising if needed
  for (let page = 0; page < 5; page++) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = `${DRIVE}/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,webViewLink)&pageSize=1000&orderBy=folder,name${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`Google Drive API error (${res.status})`);
    const data = await res.json();
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return files;
}

function toEntry(f: DriveFile): CloudEntry {
  return {
    name: f.name,
    type: f.mimeType === FOLDER_MIME ? "folder" : "file",
    size: f.size ? Number(f.size) : undefined,
    webUrl: f.webViewLink,
    ref: f.id,
  };
}

export const googleDriveAdapter: CloudProviderAdapter = {
  id: "google-drive",
  label: "Google Drive",

  async buildAuthUrl(state) {
    if (!CLIENT_ID() || !CLIENT_SECRET()) {
      throw new Error("Google Drive is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    }
    const params = new URLSearchParams({
      client_id: CLIENT_ID(),
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code) {
    const data = await exchange({
      code,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    });
    const res = await fetch(`${DRIVE}/about?fields=user(emailAddress,displayName)`, { headers: headers(data.access_token) });
    if (!res.ok) throw new Error("Could not fetch Google Drive user");
    const about = await res.json();
    const email = about.user?.emailAddress ?? "Google Drive";
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      accountId: email,
      accountName: about.user?.displayName || email,
      config: { email },
    };
  },

  async refreshToken(refreshToken) {
    const data = await exchange({
      refresh_token: refreshToken,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: "refresh_token",
    });
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  },

  async listChildren(accessToken, ref) {
    const folderId = ref || "root";
    const files = await listFolder(accessToken, folderId);
    return {
      entries: files.map(toEntry),
      rootRef: "root",
      rootName: "My Drive",
    };
  },

  async buildTree(accessToken, ref, depth) {
    const rootId = ref || "root";
    // Fetch root name
    const metaRes = await fetch(`${DRIVE}/files/${rootId === "root" ? "root" : rootId}?fields=id,name`, { headers: headers(accessToken) });
    const rootName = metaRes.ok ? ((await metaRes.json()).name as string) : "Google Drive";

    async function build(folderId: string, name: string, level: number): Promise<TreeEntry> {
      const node: TreeEntry = { name, type: "folder", children: [] };
      if (level >= depth) return node;
      const files = await listFolder(accessToken, folderId);
      for (const f of files) {
        if (f.mimeType === FOLDER_MIME) {
          node.children!.push(await build(f.id, f.name, level + 1));
        } else {
          node.children!.push({ name: f.name, type: "file", size: f.size ? Number(f.size) : 0, webUrl: f.webViewLink });
        }
      }
      return node;
    }
    return build(rootId, rootName, 0);
  },
};