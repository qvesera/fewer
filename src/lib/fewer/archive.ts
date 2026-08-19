import type { TreeEntry } from "./types";

/**
 * Internet Archive (archive.org) item import.
 *
 * Instead of HTML-crawling an item's `archive.org/download/<id>/` listing
 * (which redirects to rate-limited file nodes and frequently 503s for bots),
 * we use the metadata API (`archive.org/metadata/<id>`). A single JSON request
 * returns the item's complete file/dir tree with real sizes — no crawling,
 * no page/depth budget, no `truncated` partial results.
 */
const METADATA_TIMEOUT_MS = 8000;

/**
 * Derivative formats that duplicate the item's real content. These are dropped
 * from the tree so users see the item's actual files, not the auto-generated
 * thumbnails/tiles/metadata blobs.
 * ponytail: heuristic filter. If users ever want these, upgrade = a UI toggle.
 */
const NOISE_FORMATS = new Set(["Item Tile", "JPEG Thumb", "Metadata", "Animated GIF"]);

/** A single entry from the archive.org metadata `files` array. */
export interface ArchiveMetadataFile {
  name: string;
  size?: string | number;
  format?: string;
  source?: string;
}

/** Shape of the archive.org metadata response (fields we care about). */
export interface ArchiveMetadata {
  /** Directory paths within the item, e.g. ["/", "/emulator/images"]. Optional. */
  dirs?: string[];
  /** All files, with `/`-separated names for nested paths. */
  files?: ArchiveMetadataFile[];
}

/**
 * Extract an archive.org item identifier from a details/download/metadata URL.
 * Returns null if the URL is not an archive.org item URL.
 */
export function parseArchiveUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hostname !== "archive.org" && !u.hostname.endsWith(".archive.org")) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] !== "details" && parts[0] !== "download" && parts[0] !== "metadata") return null;
  const id = decodeURIComponent(parts[1]);
  return id || null;
}

/** Canonical details URL used as the crawl-cache key / display source. */
export function archiveDetailsUrl(identifier: string): string {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`;
}

/** Fetch an item's metadata JSON, throwing a clear error on missing items. */
export async function fetchArchiveMetadata(identifier: string): Promise<ArchiveMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      signal: controller.signal,
      headers: { "User-Agent": "fewer-app" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`archive.org metadata request failed (HTTP ${res.status})`);
    const json = (await res.json()) as ArchiveMetadata | null;
    // A nonexistent/deleted identifier resolves to an empty object `{}`.
    if (!json || (typeof json === "object" && Object.keys(json).length === 0)) {
      throw new Error("Item not found on archive.org");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a TreeEntry from archive.org metadata. Folders come from `dirs[]`;
 * files come from `files[]` (names may include `/`-separated subpaths, which
 * create folders on demand). Every entry carries a `webUrl` pointing at its
 * `archive.org/download/<id>/...` location so the existing "Open at source"
 * / Download context-menu actions work unchanged.
 */
export function buildTreeFromArchiveMetadata(
  identifier: string,
  meta: ArchiveMetadata
): { tree: TreeEntry; truncated: boolean } {
  const root: TreeEntry = {
    name: identifier,
    type: "folder",
    children: [],
    webUrl: archiveDetailsUrl(identifier),
  };

  /** Find an existing child by name or create a folder child in place. */
  const ensureDir = (parent: TreeEntry, name: string): TreeEntry => {
    const existing = parent.children!.find((c) => c.name === name);
    if (existing) return existing;
    const node: TreeEntry = { name, type: "folder", children: [] };
    parent.children!.push(node);
    return node;
  };

  /** Walk/insert a "/a/b/c" path under root, returning the leaf folder node. */
  const folderAt = (path: string): TreeEntry => {
    let node = root;
    for (const seg of path.split("/").filter(Boolean)) node = ensureDir(node, seg);
    return node;
  };

  // Pre-create every directory the item declares so empty dirs survive.
  for (const d of meta.dirs ?? []) {
    if (!d || d === "/") continue;
    folderAt(d);
  }

  const enc = (seg: string) => encodeURIComponent(seg);
  const download = `https://archive.org/download/${enc(identifier)}`;

  for (const f of meta.files ?? []) {
    if (!f.name) continue;
    // Drop auto-generated noise (_meta.xml, __ia_thumb.jpg, derivatives) that
    // just repeats the real content. Note: _meta.xml files report
    // source "original", so filter on format alone.
    if (f.format != null && NOISE_FORMATS.has(f.format)) continue;

    const segments = f.name.split("/");
    const base = segments.pop()!;
    if (!base) continue; // trailing-slash entry: the dir itself, already created above
    const parent = folderAt(segments.join("/"));

    const size = f.size != null ? Number(f.size) : undefined;
    const fileWeb = `${download}/${segments.concat(base).map(enc).join("/")}`;
    parent.children!.push({
      name: base,
      type: "file",
      size: Number.isFinite(size) ? size : undefined,
      webUrl: fileWeb,
    });
  }

  // Sort: folders first, then alphabetical.
  const sortTree = (entry: TreeEntry) => {
    if (!entry.children) return;
    entry.children.sort((a, b) =>
      a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)
    );
    for (const c of entry.children) sortTree(c);
  };
  sortTree(root);

  // The metadata API returns the complete file list — never truncated.
  return { tree: root, truncated: false };
}

/** Fetch + build in one call for the crawl route. Throws on lookup failure. */
export async function fetchArchiveTree(
  identifier: string
): Promise<{ tree: TreeEntry; truncated: boolean }> {
  const meta = await fetchArchiveMetadata(identifier);
  return buildTreeFromArchiveMetadata(identifier, meta);
}