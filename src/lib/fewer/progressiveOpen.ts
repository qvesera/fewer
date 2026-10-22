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
import type { FewerEdge, FewerNode, TreeEntry } from "./types";

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
/** The live scan's buffer flush, registered by `startBackgroundScanWith` so
 *  `cancelActiveScan` can land already-buffered batches before invalidating the
 *  generation (T-219). */
let activeFlush: (() => boolean) | null = null;

/**
 * Abort the in-flight background scan (a new open or a clear takes over).
 *
 * T-219: with batch coalescing, cancelling must first FLUSH what is already
 * buffered — the chip's contract is "the folder stays as loaded so far", and
 * the pre-coalescing behaviour had already written every emitted batch to the
 * store before the cancel arrived. Then the generation is bumped so an ARMED
 * flush timer (a no-op by then) can never write into the canvas the clear or
 * the next open owns, and the scan chip is cleared here instead of in the
 * scan-end tail (which now early-returns on a generation change).
 */
export function cancelActiveScan(): void {
  activeController?.abort();
  activeController = null;
  if (activeFlush?.()) {
    // The flushed batches parked near their parents — settle them now, exactly
    // like the old scan-end tail did for an aborted scan.
    useGraphStore.getState().relayout();
  }
  activeFlush = null;
  generation++;
  clearScanStatus();
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
/** T-219: coalesce directory batches into one store write per this interval. */
const FLUSH_MS = 100;

/**
 * Phase 2: fill the canvas in the background. Batches append through
 * `appendGraphBatch`, layout settles on a coalesced schedule, and whatever the
 * budget did not reach is marked "unscanned" on its folder card.
 *
 * T-219: the old `setTimeout` debounce reset on EVERY batch, so a fast scan
 * (batches every few ms) deferred the layout until the queue drained — one
 * giant relayout at the end, and no settling at all during the fill. It is now
 * a THROTTLE: the first batch arms a single timer that later batches do NOT
 * push out, so a layout runs at most once per RELAYOUT_DEBOUNCE_MS and at
 * LEAST that often during a scan (bounded cost — one pass per 500ms, not one
 * per batch and not one giant pass at the end). The pass is also skipped when
 * no node was added since the last layout (edge-repair/size-refresh batches).
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
  // T-219: node count at the last layout — a batch that only repairs edges or
  // refreshes sizes needs no pass, and relayout() itself is O(graph).
  let nodesAtLastLayout = -1;
  const scheduleRelayout = (): void => {
    // THROTTLE, not debounce (T-219): a pending timer is left alone, so a fast
    // scan gets one layout per RELAYOUT_DEBOUNCE_MS instead of deferring every
    // pass until the batch stream pauses.
    if (relayoutTimer) return;
    relayoutTimer = setTimeout(() => {
      relayoutTimer = null;
      if (gen !== generation) return;
      const s = useGraphStore.getState();
      if (s.nodes.length === nodesAtLastLayout) return; // nothing new to settle
      nodesAtLastLayout = s.nodes.length;
      s.relayout();
    }, RELAYOUT_DEBOUNCE_MS);
  };

  // T-219: BATCH COALESCING. Each `appendGraphBatch` copies the whole nodes and
  // edges arrays (immutable store), so one store write per directory read is
  // still O(B·N) — measured at ~0.4–0.8 ms/batch × 9.5k–24.5k batches (3.9 s
  // at 20k, 20 s at 50k, all copy cost). Directories arrive in milliseconds,
  // so they are buffered and flushed as ONE append on a throttle: the first
  // pending batch arms FLUSH_MS, everything buffered by then lands together,
  // and a stream that never pauses still flushes every FLUSH_MS (no trailing-
  // debounce starvation). BFS order is preserved across the buffer, so parents
  // always precede children inside the combined append.
  const pendingNodes: FewerNode[] = [];
  const pendingEdges: FewerEdge[] = [];
  // Parents built into the buffer but not yet in the store — later batches'
  // `parentIdOf` must resolve through this, or every child of a buffered
  // folder would fall back to the root (the T-212 orphan fallback).
  const pendingPathId = new Map<string, string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPending = (): boolean => {
    flushTimer = null;
    // A generation change means the canvas was cleared/replaced — the new
    // owner's graph must not receive the old scan's leftovers.
    if (gen !== generation) {
      pendingNodes.length = 0;
      pendingEdges.length = 0;
      pendingPathId.clear();
      return false;
    }
    if (!pendingNodes.length && !pendingEdges.length) return false;
    const nodes = pendingNodes.splice(0);
    const edges = pendingEdges.splice(0);
    pendingPathId.clear(); // everything below lands in the store synchronously
    useGraphStore.getState().appendGraphBatch(nodes, edges);
    scheduleRelayout();
    return true;
  };

  const scheduleFlush = (): void => {
    if (flushTimer) return; // throttle: the armed timer flushes everything
    flushTimer = setTimeout(flushPending, FLUSH_MS);
  };
  // Let cancelActiveScan land this scan's buffer before it invalidates the
  // generation (see cancelActiveScan).
  activeFlush = flushPending;

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
        // Buffered parents first: they are about to land in the store, but a
        // later batch of the SAME flush window arrives before that.
        (rel) => {
          const path = rel ? `${rootName}/${rel}` : rootName;
          return pathIdOf(path) ?? pendingPathId.get(path);
        },
        { includeFiles: options.includeFiles, rootId },
      );
      if (!built.nodes.length) return;
      for (const n of built.nodes) if (n.data.path) pendingPathId.set(n.data.path, n.id);
      pendingNodes.push(...built.nodes);
      pendingEdges.push(...built.edges);
      scheduleFlush();
    },
  };

  void (async () => {
    const result = await continueScan(queue, engine, {
      onTick: (scanned, dirs) => {
        if (gen === generation) setScanStatus({ scanned: base + scanned, dirs: baseDirs + dirs });
      },
    });
    if (gen !== generation) return;
    // T-219: land whatever the buffer still holds BEFORE the heal/badge passes
    // below — they read the store and must see every scanned card.
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushPending();
    activeFlush = null; // scan over — cancel has nothing left to land
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
