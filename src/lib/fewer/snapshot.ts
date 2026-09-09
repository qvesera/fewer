import { useGraphStore } from "@/store/graphStore";
import type { SavedGraphData } from "./savedGraphs";
import type { FewerNode, FewerEdge } from "./types";

/**
 * Capture the current graph data into a serializable snapshot.
 * Used for saving graphs to the account (cloud) and for the local
 * reload-persistence cache. Graph data only — app settings are per-account
 * user settings and deliberately excluded.
 */
export function buildSnapshot(): SavedGraphData {
  const s = useGraphStore.getState();
  return {
    nodes: s.nodes,
    edges: s.edges,
    tags: s.tags,
    localRootPath: s.localRootPath,
  };
}

export interface ApplySnapshotOptions {
  /** `dataSource` label stamped on the loaded graph; default "saved". */
  source?: string;
}

/**
 * Restore a graph snapshot into the store. Graph data only: node/edge
 * positions are preserved (`preservePositions`), and no app settings are
 * touched — the viewer's current settings (direction, edge style, theme,
 * minimap, …) win, so loading a graph never clobbers them.
 */
export function applySnapshot(data: SavedGraphData, opts?: ApplySnapshotOptions) {
  const s = useGraphStore.getState();

  s.setGraph(data.nodes as never, data.edges as never, false, undefined, { preservePositions: true });

  useGraphStore.setState({
    dataSource: opts?.source ?? "saved",
    localRootPath: data.localRootPath ?? null,
    skipNextAutoLayout: true,
    tags: data.tags ?? [],
  });
}

// ── Session-reload persistence cache ──────────────────────────────────────
// Keeps the graph on canvas (imported, sample, cloud-opened, edited) across a
// page reload / crash restore. Uses sessionStorage so each tab gets its own
// workspace — two tabs never clobber each other's graph.
// ponytail: one-time migration lifts a legacy localStorage key on first load.

const LOCAL_KEY = "fewer-graph";
const LEGACY_KEY = "fewer-graph"; // same string — legacy was in localStorage
const LOCAL_VERSION = 1;

interface LocalGraphSnapshot {
  version: number;
  nodes: FewerNode[];
  edges: FewerEdge[];
  tags: { id: string; label: string; color: string }[];
  dataSource: string | null;
  localRootPath: string | null;
}

/** Cache the current graph so a reload restores the canvas. Empty graph → key removed. */
export function saveGraphLocal(snap: {
  nodes: FewerNode[];
  edges: FewerEdge[];
  tags: { id: string; label: string; color: string }[];
  dataSource: string | null;
  localRootPath: string | null;
}): void {
  if (typeof window === "undefined") return;
  try {
    if (snap.nodes.length === 0) {
      sessionStorage.removeItem(LOCAL_KEY);
      return;
    }
    const payload: LocalGraphSnapshot = { version: LOCAL_VERSION, ...snap };
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  } catch {
    /* quota/failure — just skip caching; never break the app */
  }
}

/** Load the cached graph, if any. Returns null when absent/corrupt/empty. */
export function loadGraphLocal(): { data: SavedGraphData; dataSource: string | null } | null {
  if (typeof window === "undefined") return null;
  try {
    // One-time migration: lift legacy localStorage graph into sessionStorage
    // so existing users keep their canvas after this change, then remove the
    // old key so other tabs stop sharing the same graph.
    if (!sessionStorage.getItem(LOCAL_KEY)) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        sessionStorage.setItem(LOCAL_KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
      }
    }

    const raw = sessionStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalGraphSnapshot;
    if (parsed.version !== LOCAL_VERSION || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return {
      data: { nodes: parsed.nodes, edges: parsed.edges, tags: parsed.tags ?? [], localRootPath: parsed.localRootPath ?? null },
      dataSource: parsed.dataSource ?? null,
    };
  } catch {
    return null;
  }
}