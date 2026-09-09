import { useGraphStore } from "@/store/graphStore";
import type { SavedGraphData } from "./savedGraphs";
import { SNAPSHOT_VERSION } from "./savedGraphs";
import type { FewerNode, FewerEdge } from "./types";
import { TAG_FALLBACK_COLOR, type Tag } from "./tags";

// ── Node pruning (strip transient React Flow fields before save) ────────────

/** Fields that React Flow adds at runtime but must not ride into cloud/sessionStorage. */
const STRIP_NODE_KEYS = new Set(["selected", "dragging", "measured"]);

/**
 * Strip transient RF fields from a node before serialization.
 * Keeps the node's typed `data` intact; only removes runtime UI flags
 * that inflate payloads and trigger false diffs in version dedup.
 */
export function pruneNodeForSave(node: FewerNode): FewerNode {
  const pruned: Record<string, unknown> = {};
  for (const k of Object.keys(node)) {
    if (STRIP_NODE_KEYS.has(k)) continue;
    pruned[k] = node[k as keyof FewerNode];
  }
  // Also strip transient search-highlight flags from node.data
  const data = pruned.data as Record<string, unknown> | undefined;
  if (data) {
    const d = { ...data };
    delete d.highlighted;
    delete d.dimmed;
    pruned.data = d;
  }
  return pruned as unknown as FewerNode;
}

// ── Snapshot normalization (validate / migrate on load) ─────────────────────

/**
 * Normalize a loaded snapshot: coerce tag colors, drop dangling tag refs,
 * strip unknown fields. Mutates in place for zero-copy; caller should not
 * reuse the input for anything else.
 */
export function normalizeSnapshot(data: SavedGraphData): SavedGraphData {
  // Tag registry: coerce invalid colors to fallback
  const tags: Tag[] = (data.tags ?? []).map((t) => ({
    id: t.id,
    label: t.label ?? t.id,
    color: typeof t.color === "string" && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : TAG_FALLBACK_COLOR,
  }));
  const validTagIds = new Set(tags.map((t) => t.id));

  // Nodes: drop tagIds not in registry, coerce colors
  const nodes = data.nodes.map((n) => {
    const node = { ...n, data: { ...n.data } };
    if (Array.isArray(node.data.tagIds)) {
      node.data.tagIds = node.data.tagIds.filter((id) => validTagIds.has(id));
    }
    return node;
  });

  return { ...data, dataVersion: SNAPSHOT_VERSION, nodes, tags };
}

// ── Build / Apply ───────────────────────────────────────────────────────────

/**
 * Capture the current graph data into a serializable snapshot.
 * Used for saving graphs to the account (cloud) and for the local
 * reload-persistence cache. Graph data only — app settings are per-account
 * user settings and deliberately excluded.
 */
export function buildSnapshot(): SavedGraphData {
  const s = useGraphStore.getState();
  return {
    dataVersion: SNAPSHOT_VERSION,
    nodes: s.nodes.map(pruneNodeForSave),
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
  const normalized = normalizeSnapshot(data);

  s.setGraph(normalized.nodes as never, normalized.edges as never, false, undefined, { preservePositions: true });

  useGraphStore.setState({
    dataSource: opts?.source ?? "saved",
    localRootPath: normalized.localRootPath ?? null,
    skipNextAutoLayout: true,
    tags: normalized.tags ?? [],
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
  dataVersion: number;
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
    const payload: LocalGraphSnapshot = { version: LOCAL_VERSION, dataVersion: SNAPSHOT_VERSION, ...snap };
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