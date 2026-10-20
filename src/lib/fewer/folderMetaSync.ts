import { useGraphStore } from "@/store/graphStore";
import { isHost, nativeFolderMetaGet, nativeFolderMetaSet } from "./nativeShell";
import { applyFolderMeta, captureFolderMeta, parseFolderMeta } from "./folderMeta";
import type { FewerNode } from "./types";
import type { Group } from "./groups";

/**
 * Store glue for folder metadata (T-203): while a folder root is loaded, tag
 * and group changes are auto-saved (debounced) to the app's data directory;
 * opening a folder restores its saved document. The desktop app never asks
 * the user to press save — the metadata simply belongs to the folder.
 *
 * Shell-only: every entry point no-ops outside the desktop host.
 */

const SAVE_DEBOUNCE_MS = 800;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRoot: string | null = null;

/** Write the CURRENT store state as the document for `root` (best-effort). */
async function writeMetaFor(root: string): Promise<void> {
  const s = useGraphStore.getState();
  // The canvas may have moved on while a write was queued.
  if (!root || s.localRootPath !== root || s.dataSource !== "directory" || s.nodes.length === 0) return;
  const meta = captureFolderMeta({
    root,
    nodes: s.nodes as FewerNode[],
    tags: s.tags,
    groups: (s.groups ?? []) as Group[],
  });
  try {
    await nativeFolderMetaSet(root, JSON.stringify(meta));
  } catch {
    // Metadata is a convenience — a failed write never breaks the session.
  }
}

/** Flush a pending debounced save right now (called before a new folder opens). */
export async function flushFolderMeta(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const root = pendingRoot;
  pendingRoot = null;
  if (root) await writeMetaFor(root);
}

/**
 * Subscribe to the store: any change to tags, groups or the node tag
 * assignments of a loaded folder root schedules a debounced save. Returns the
 * unsubscribe (which also flushes).
 */
export function startFolderMetaSync(): () => void {
  if (!isHost()) return () => {};
  const unsub = useGraphStore.subscribe((state, prev) => {
    if (state.dataSource !== "directory" || !state.localRootPath) return;
    if (state.tags === prev.tags && state.groups === prev.groups && state.nodes === prev.nodes) return;
    pendingRoot = state.localRootPath;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const root = pendingRoot;
      pendingRoot = null;
      if (root) void writeMetaFor(root);
    }, SAVE_DEBOUNCE_MS);
  });
  return () => {
    unsub();
    void flushFolderMeta();
  };
}

/**
 * Restore the saved tags/groups for a freshly opened folder root. No-op
 * outside the shell, without a document, or when the canvas already moved on.
 */
export async function restoreFolderMeta(root: string): Promise<void> {
  if (!isHost() || !root) return;
  let raw: string | null = null;
  try {
    raw = (await nativeFolderMetaGet(root)).contents;
  } catch {
    return;
  }
  const meta = parseFolderMeta(raw);
  if (!meta) return;
  const s = useGraphStore.getState();
  if (s.localRootPath !== root) return;
  const patch = applyFolderMeta(meta, s.nodes as FewerNode[]);
  useGraphStore.setState({
    tags: patch.tags,
    groups: patch.groups,
    nodes: patch.nodes as never,
  });
}