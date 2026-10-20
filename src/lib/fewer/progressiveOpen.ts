import { useGraphStore } from "@/store/graphStore";
import { nativeFsReadBytes, nativeListDir } from "./nativeShell";
import type { ImportOptions } from "./importOptions";
import { expandArchives } from "./archiveExpand";
import {
  DEFAULT_SKELETON_DEPTH,
  continueScan,
  scanSkeleton,
  type ScanBatch,
  type ScanDirEntry,
  type ScanQueueItem,
} from "./progressiveScan";
import { buildBatchGraph, buildGraphFromBatches, connectOrphansToRoot, type BatchGraph } from "./progressiveGraph";
import { clearScanStatus, getScanStatus, setScanStatus } from "./scanStatus";
import type { TreeEntry } from "./types";

/**
 * Progressive folder open, desktop shell (T-205/206/207): read the first
 * couple of levels, render them, then keep filling the canvas in the
 * background until the node/time budget stops the crawl. The canvas is never
 * blank while a big folder loads — the skeleton lands in milliseconds and
 * deeper cards arrive as they are scanned.
 */

const LIST_PAGE = 500;

let activeController: AbortController | null = null;
let generation = 0;

/** Abort the in-flight background scan (a new open or a clear takes over). */
export function cancelActiveScan(): void {
  activeController?.abort();
  activeController = null;
}

/** Whole-directory listing via the shell's windowed list_dir RPC. */
export async function nativeListAll(abs: string): Promise<ScanDirEntry[]> {
  const out: ScanDirEntry[] = [];
  let offset = 0;
  for (;;) {
    const page = await nativeListDir(abs, offset, LIST_PAGE);
    out.push(...page.entries);
    offset += page.entries.length;
    if (offset >= page.total || page.entries.length === 0) break;
  }
  return out;
}

/** List one archive's members as scan batches (parentPath = the archive path). */
export function archiveMemberReader(options: ImportOptions) {
  return async (abs: string, rel: string, depth: number): Promise<ScanBatch[] | null> => {
    const buf = await nativeFsReadBytes(abs, 64 * 1024 * 1024);
    const leafName = rel.split("/").pop() ?? "archive";
    const tree: TreeEntry = {
      name: "root",
      type: "folder",
      children: [{ name: leafName, type: "file", size: buf.byteLength }],
    };
    await expandArchives(tree, async () => new Blob([buf]), options);
    const members = tree.children?.[0]?.children;
    if (!members?.length) return null;
    const batches: ScanBatch[] = [];
    const queue: Array<{ rel: string; depth: number; entries: TreeEntry[] }> = [
      { rel, depth, entries: members },
    ];
    while (queue.length) {
      const cur = queue.shift()!;
      const flat: ScanDirEntry[] = cur.entries.map((m) =>
        m.type === "file"
          ? { name: m.name, type: "file", size: m.size ?? 0 }
          : { name: m.name, type: "folder" },
      );
      if (flat.length) batches.push({ parentPath: cur.rel, parentDepth: cur.depth, entries: flat });
      for (const m of cur.entries) {
        if (m.type === "folder" && m.children?.length) {
          queue.push({ rel: `${cur.rel}/${m.name}`, depth: cur.depth + 1, entries: m.children });
        }
      }
    }
    return batches;
  };
}

export interface SkeletonOpen {
  rootName: string;
  graph: BatchGraph;
  queue: ScanQueueItem[];
  /** Entries the skeleton itself already emitted (seed for the chip, T-215). */
  scanned: number;
}

export interface SkeletonRequest {
  /** Directory listing path — the real absolute path in the shell, the root
   *  name on the web (handle/FileList sources are name-keyed). */
  rootAbs: string;
  rootName: string;
  listAll(absPath: string): Promise<ScanDirEntry[]>;
  options: ImportOptions;
}

/** Generic skeleton (T-208): any listing primitive — shell and web share it. */
export async function openSkeletonWith(req: SkeletonRequest): Promise<SkeletonOpen> {
  cancelActiveScan();
  // T-215: a new open replaces the previous scan entirely — no stale chip,
  // no leftover queue that could be resumed into the wrong folder.
  pendingResume = null;
  clearScanStatus();
  const engine = { options: req.options, listAll: req.listAll };
  const skeleton = await scanSkeleton(req.rootAbs, engine, DEFAULT_SKELETON_DEPTH);
  const graph = buildGraphFromBatches(req.rootName, skeleton.batches, {
    includeFiles: req.options.includeFiles,
  });
  return { rootName: req.rootName, graph, queue: skeleton.queue, scanned: skeleton.scanned };
}

/** Phase 1, desktop shell: cancel any previous scan, read the skeleton. */
export async function openFolderSkeleton(
  rootPath: string,
  options: ImportOptions,
): Promise<SkeletonOpen> {
  const rootName = rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath;
  return openSkeletonWith({
    rootAbs: rootPath,
    rootName,
    listAll: nativeListAll,
    options,
  });
}

// path → node id, cached by the store's nodes array identity so each batch
// costs one lookup pass instead of a find over the whole graph.
let cachedNodes: unknown = null;
let cachedPathId: Map<string, string> | null = null;
function pathIdOf(path: string): string | undefined {
  const nodes = useGraphStore.getState().nodes;
  if (cachedNodes !== nodes) {
    const map = new Map<string, string>();
    for (const n of nodes) {
      if (n.data.path) map.set(n.data.path, n.id);
    }
    cachedNodes = nodes;
    cachedPathId = map;
  }
  return cachedPathId?.get(path);
}

const RELAYOUT_DEBOUNCE_MS = 500;

/**
 * Phase 2: fill the canvas in the background. Batches append through
 * `appendGraphBatch`, layout settles on a debounce, and whatever the budget
 * did not reach is marked "unscanned" on its folder card.
 */
export interface ScanIo {
  listAll(absPath: string): Promise<ScanDirEntry[]>;
  readArchiveMembers?(absPath: string, relPath: string, depth: number): Promise<ScanBatch[] | null>;
}

/** Generic background fill (T-208): any listing primitive. */
export function startBackgroundScanWith(req: {
  rootAbs: string;
  rootName: string;
  options: ImportOptions;
  queue: ScanQueueItem[];
  io: ScanIo;
  /** Skeleton entries already on the canvas — the chip counts from here (T-215). */
  initialScanned?: number;
}): void {
  const { rootAbs, rootName, options, queue, io } = req;
  generation++;
  const gen = generation;
  const controller = new AbortController();
  activeController = controller;
  cachedNodes = null;
  // Remember the run so the chip's Resume can continue where the budget
  // stopped (T-215). Cleared when the queue drains or a new folder opens.
  pendingResume = req;
  const base = req.initialScanned ?? 0;
  let baseDirs = 0;
  setScanStatus({
    active: true,
    root: rootName,
    scanned: base,
    dirs: 0,
    stopped: false,
    reason: null,
    pending: false,
  });

  let relayoutTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRelayout = (): void => {
    if (relayoutTimer) clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(() => {
      relayoutTimer = null;
      if (gen === generation) useGraphStore.getState().relayout();
    }, RELAYOUT_DEBOUNCE_MS);
  };

  const engine = {
    options,
    listAll: io.listAll,
    signal: controller.signal,
    ...(io.readArchiveMembers ? { readArchiveMembers: io.readArchiveMembers } : {}),
    onBatch: (batch: ScanBatch) => {
      if (gen !== generation) return;
      // The canvas was cleared or replaced underneath us — stop wasting IO.
      const rootId = pathIdOf(rootName);
      if (!rootId) {
        controller.abort();
        return;
      }
      const built = buildBatchGraph(
        rootName,
        batch,
        (rel) => pathIdOf(rel ? `${rootName}/${rel}` : rootName),
        { includeFiles: options.includeFiles, rootId },
      );
      if (!built.nodes.length) return;
      useGraphStore.getState().appendGraphBatch(built.nodes, built.edges);
      scheduleRelayout();
    },
  };

  void (async () => {
    const result = await continueScan(queue, engine, {
      onTick: (scanned, dirs) => {
        if (gen === generation) setScanStatus({ scanned: base + scanned, dirs: baseDirs + dirs });
      },
    });
    if (gen !== generation) return;
    // T-212: make sure the finished graph is ONE tree — any node the walker
    // could not wire (a parent filtered out, a re-emitted batch) attaches to
    // the root instead of floating as a top-level card.
    const s = useGraphStore.getState();
    const rootNode = s.nodes.find((n) => n.data.isRoot);
    if (rootNode) {
      const heal = connectOrphansToRoot(s.nodes, s.edges, rootNode.id);
      if (heal.length) s.appendGraphBatch([], heal);
    }
    if (relayoutTimer) {
      clearTimeout(relayoutTimer);
      relayoutTimer = null;
      useGraphStore.getState().relayout();
    }
    if (result.reason === "budget" && result.unscanned.length) {
      const paths = new Set(result.unscanned.map((r) => `${rootName}/${r}`));
      useGraphStore.setState((s) => ({
        nodes: s.nodes.map((n) =>
          n.data.path && paths.has(n.data.path)
            ? { ...n, data: { ...n.data, unscanned: true } }
            : n,
        ),
      }));
    }
    // T-203: the skeleton restore only saw the first levels — apply the saved
    // tags/groups again now that every appended card is on the canvas.
    const { restoreFolderMeta } = await import("./folderMetaSync");
    await restoreFolderMeta(rootAbs);
    if (result.reason === "aborted") {
      // User stopped it (✕, another folder, cleared canvas): no pause chip,
      // no "not loaded" badges — the folders are simply as-is (T-215).
      clearScanStatus();
      return;
    }
    if (!result.stopped) {
      pendingResume = null; // drained — nothing left to resume
      clearScanStatus();
      return;
    }
    // Budget pause: badges + a resumable amber chip.
    setScanStatus({ active: false, stopped: true, reason: "budget", pending: queue.length > 0 });
  })();
}

/** Chip's Resume (T-215): continue the queue the budget paused. */
export function resumeBackgroundScan(): void {
  if (!pendingResume) return;
  if (getScanStatus().active) return;
  startBackgroundScanWith({ ...pendingResume, initialScanned: getScanStatus().scanned });
}

/** Phase 2, desktop shell: native list_dir + per-archive expansion. */
export function startBackgroundScan(
  rootPath: string,
  rootName: string,
  options: ImportOptions,
  queue: ScanQueueItem[],
  initialScanned = 0,
): void {
  startBackgroundScanWith({
    rootAbs: rootPath,
    rootName,
    options,
    queue,
    initialScanned,
    io: {
      listAll: nativeListAll,
      ...(options.expandArchives ? { readArchiveMembers: archiveMemberReader(options) } : {}),
    },
  });
}

// Resume state for the paused scan (T-215); replaced by every new open.
let pendingResume: Parameters<typeof startBackgroundScanWith>[0] | null = null;
