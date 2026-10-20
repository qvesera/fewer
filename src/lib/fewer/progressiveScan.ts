import type { ImportOptions } from "./importOptions";
import { isSkipped, isExtAllowed } from "./fsFilters";
import { isArchiveName } from "./archiveExpand";

/**
 * Progressive folder scan (T-205): a breadth-first walker that EMITS each
 * directory's entries as soon as they are read instead of building one big
 * TreeEntry. The caller renders a depth-2 skeleton immediately and lets the
 * background batches fill the canvas in.
 *
 * The listing primitive and the archive reader are injected, so this module
 * stays host-free: the desktop shell feeds it `list_dir` pages, tests feed it
 * a map, and the web build can feed it a handle-walk later.
 */

export interface ScanDirEntry {
  name: string;
  type: "folder" | "file";
  size?: number;
  symlink?: { target: string; broken: boolean };
}

export interface ScanBatch {
  /** Relative path of the folder these entries live in ("" = the root). */
  parentPath: string;
  /** Depth of that parent folder (0 = the root). */
  parentDepth: number;
  entries: ScanDirEntry[];
}

export interface ProgressiveScanResult {
  scanned: number;
  dirs: number;
  stopped: boolean;
  /** Why the walk stopped: the budget (resumable) or an abort (user action). */
  reason: "budget" | "aborted" | null;
  /** Relative paths of folders that were queued but never read. */
  unscanned: string[];
}

export const DEFAULT_SKELETON_DEPTH = 2;
export const DEFAULT_MAX_NODES = 25_000;
export const DEFAULT_MAX_MS = 30_000;

function posixJoin(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

function absJoin(base: string, name: string): string {
  return base.endsWith("/") ? base + name : `${base}/${name}`;
}

/** localTree/nativeTree `allowedFile` semantics, without touching a tree. */
function allowedFile(name: string, options: ImportOptions): boolean {
  if (!options.includeFiles || options.extensions.length === 0) return true;
  if (options.expandArchives && isArchiveName(name)) return true;
  return isExtAllowed(name, options);
}

export interface ScanQueueItem {
  abs: string;
  rel: string;
  depth: number;
}

interface ScanEngine {
  options: ImportOptions;
  listAll(absPath: string): Promise<ScanDirEntry[]>;
  /** Milliseconds spent reading archives — excluded from the wall-clock budget (T-215). */
  archiveMs?: number;
  readArchiveMembers?(absPath: string, relPath: string, depth: number): Promise<ScanBatch[] | null>;
  signal?: AbortSignal;
  onBatch?(batch: ScanBatch): void;
}

function sortEntries(entries: ScanDirEntry[]): ScanDirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/** Read one directory: emit its batch, queue its sub-folders, expand archives. */
async function readDir(
  engine: ScanEngine,
  abs: string,
  rel: string,
  depth: number,
  queue: ScanQueueItem[],
): Promise<number> {
  const { options } = engine;
  if (engine.signal?.aborted) return 0;
  let entries: ScanDirEntry[];
  try {
    entries = await engine.listAll(abs);
  } catch {
    return 0; // unreadable folder — skip, never fail the scan
  }
  const kept: ScanDirEntry[] = [];
  for (const e of entries) {
    if (e.type === "folder") {
      if (isSkipped(e.name, options)) continue;
      kept.push(e);
      queue.push({ abs: absJoin(abs, e.name), rel: posixJoin(rel, e.name), depth: depth + 1 });
    } else if (allowedFile(e.name, options)) {
      kept.push(e);
    }
  }
  const sorted = sortEntries(kept);
  if (sorted.length) engine.onBatch?.({ parentPath: rel, parentDepth: depth, entries: sorted });

  // Archives (T-202): list members via the injected reader and emit them as
  // batches under the archive's own path — one level, never nested expansion.
  if (options.expandArchives && engine.readArchiveMembers) {
    for (const e of sorted) {
      if (e.type !== "file" || !isArchiveName(e.name)) continue;
      if (engine.signal?.aborted) return sorted.length;
      // T-215: archive reads can dwarf everything else (a 64MB zip on a slow
      // disk); their time must not eat the scan's wall-clock budget.
      const archiveStarted = Date.now();
      try {
        const batches = await engine.readArchiveMembers(absJoin(abs, e.name), posixJoin(rel, e.name), depth + 1);
        for (const b of batches ?? []) engine.onBatch?.(b);
      } catch {
        // Unreadable archive listing — the archive row stays on the canvas.
      } finally {
        engine.archiveMs = (engine.archiveMs ?? 0) + (Date.now() - archiveStarted);
      }
    }
  }
  return sorted.length;
}

export interface SkeletonResult {
  batches: ScanBatch[];
  /** Folders at (or under) the skeleton depth boundary, ready to continue. */
  queue: ScanQueueItem[];
  scanned: number;
}

/**
 * Phase 1 (T-205): read the root plus `skeletonDepth` levels — fast even on
 * huge trees — and return the batches plus the queue for the background fill.
 */
export async function scanSkeleton(
  rootAbs: string,
  config: ScanEngine,
  skeletonDepth = DEFAULT_SKELETON_DEPTH,
): Promise<SkeletonResult> {
  const batches: ScanBatch[] = [];
  const queue: ScanQueueItem[] = [];
  const engine: ScanEngine = { ...config, onBatch: (b) => batches.push(b) };
  let scanned = 0;
  scanned += await readDir(engine, rootAbs, "", 0, queue);
  // Breadth-first: everything queued after level `skeletonDepth` stays queued.
  while (queue.length && queue[0]!.depth <= skeletonDepth) {
    const next = queue.shift()!;
    scanned += await readDir(engine, next.abs, next.rel, next.depth, queue);
  }
  return { batches, queue, scanned };
}

/**
 * Phase 2 (T-205): keep walking the queue, emitting batches, until the queue
 * empties or the node / wall-clock budget stops it. Folders left in the queue
 * come back as `unscanned` so the UI can mark them "not scanned".
 */
export async function continueScan(
  queue: ScanQueueItem[],
  config: ScanEngine,
  budget?: { maxNodes?: number; maxMs?: number; onTick?(scanned: number, dirs: number): void },
): Promise<ProgressiveScanResult> {
  const maxNodes = budget?.maxNodes ?? DEFAULT_MAX_NODES;
  const maxMs = budget?.maxMs ?? DEFAULT_MAX_MS;
  const started = Date.now();
  let scanned = 0;
  let dirs = 0;
  let stopped = false;
  let reason: ProgressiveScanResult["reason"] = null;
  while (queue.length) {
    if (config.signal?.aborted) {
      stopped = true;
      reason = "aborted";
      break;
    }
    const elapsed = Date.now() - started - (config.archiveMs ?? 0);
    if (scanned >= maxNodes || elapsed >= maxMs) {
      stopped = true;
      reason = "budget";
      break;
    }
    const next = queue.shift()!;
    scanned += await readDir(config, next.abs, next.rel, next.depth, queue);
    dirs++;
    budget?.onTick?.(scanned, dirs);
  }
  return { scanned, dirs, stopped, reason, unscanned: queue.map((q) => q.rel) };
}
