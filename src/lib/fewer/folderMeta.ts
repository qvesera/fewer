import type { FewerNode } from "./types";
import type { Tag } from "./tags";
import type { Group } from "./groups";

/**
 * Folder metadata document (T-203): the tags and groups the user attached
 * while exploring a folder root, keyed by the store's own relative node paths
 * so the document survives re-imports (node ids are fresh uuids every walk).
 * Pure module — capture/apply/parse only; the store glue lives in
 * folderMetaSync.ts and the disk side in electron/folderMeta.ts.
 */

export const FOLDER_META_VERSION = 1;

export interface FolderMeta {
  version: number;
  /** Absolute path of the folder root this document belongs to. */
  root: string;
  tags: Tag[];
  /** Groups with membership expressed as node PATHS (not ids). */
  groups: Group[];
  /** node path → tag ids. */
  nodeTags: Record<string, string[]>;
}

export interface FolderMetaSource {
  root: string;
  nodes: FewerNode[];
  tags: Tag[];
  groups: Group[];
}

/** Capture the current tags/groups of a loaded folder as a portable document. */
export function captureFolderMeta(src: FolderMetaSource): FolderMeta {
  const pathOf = new Map<string, string>(); // node id → relative path
  for (const n of src.nodes) {
    if (n.data.path) pathOf.set(n.id, n.data.path);
  }
  const nodeTags: Record<string, string[]> = {};
  for (const n of src.nodes) {
    if (n.data.path && Array.isArray(n.data.tagIds) && n.data.tagIds.length > 0) {
      nodeTags[n.data.path] = [...n.data.tagIds];
    }
  }
  const groups = (src.groups ?? []).map((g) => ({
    ...g,
    memberIds: g.memberIds.map((id) => pathOf.get(id) ?? "").filter(Boolean),
  }));
  return {
    version: FOLDER_META_VERSION,
    root: src.root,
    tags: src.tags ?? [],
    groups,
    nodeTags,
  };
}

export interface FolderMetaPatch {
  tags: Tag[];
  groups: Group[];
  /** The same nodes with saved tag assignments applied (fresh array). */
  nodes: FewerNode[];
}

/**
 * Apply a document onto the nodes of a freshly opened folder. Memberships and
 * tag refs that point at paths which no longer exist are dropped — a folder
 * that changed on disk degrades, never fails.
 */
export function applyFolderMeta(meta: FolderMeta, nodes: FewerNode[]): FolderMetaPatch {
  const idOf = new Map<string, string>(); // relative path → node id (last wins)
  for (const n of nodes) {
    if (n.data.path) idOf.set(n.data.path, n.id);
  }
  const applied = nodes.map((n) => {
    const tagIds = n.data.path ? meta.nodeTags[n.data.path] : undefined;
    if (!tagIds || tagIds.length === 0) return n;
    return { ...n, data: { ...n.data, tagIds: [...tagIds] } };
  });
  const validTagIds = new Set((meta.tags ?? []).map((t) => t.id));
  const groups = (meta.groups ?? [])
    .map((g) => ({
      ...g,
      memberIds: g.memberIds.map((p) => idOf.get(p) ?? "").filter(Boolean),
    }))
    .filter((g) => g.memberIds.length > 0);
  // Drop tag ids a node kept from a document whose registry shrank.
  const pruned = applied.map((n) => {
    if (!Array.isArray(n.data.tagIds)) return n;
    const kept = n.data.tagIds.filter((id) => validTagIds.has(id));
    if (kept.length === n.data.tagIds.length) return n;
    return { ...n, data: { ...n.data, tagIds: kept } };
  });
  return { tags: meta.tags ?? [], groups, nodes: pruned };
}

/** Parse a stored document; null on absent/corrupt/foreign shapes. */
export function parseFolderMeta(raw: string | null): FolderMeta | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<FolderMeta>;
    if (!m || m.version !== FOLDER_META_VERSION || typeof m.root !== "string") return null;
    if (!Array.isArray(m.tags) || !Array.isArray(m.groups)) return null;
    if (!m.nodeTags || typeof m.nodeTags !== "object") return null;
    return m as FolderMeta;
  } catch {
    return null;
  }
}