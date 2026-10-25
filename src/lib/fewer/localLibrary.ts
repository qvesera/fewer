// Fewer graph document (`.fwr`): the portable snapshot envelope.
//
//   { format_version, graph: { id, name, data, created_at, updated_at, … } }
//
// The same shape the web app exports and imports, so a document moves between
// accounts and devices. Pure module: no FS, no store, no host bridge.
import type { SavedGraph, SavedGraphData } from "./savedGraphs";

/** Bump when the graph-file shape changes incompatibly. */
export const LIBRARY_FORMAT_VERSION = 1;

/** One graph as stored in a `.fwr` document. */
export interface LibraryGraphFile {
  format_version: number;
  graph: SavedGraph;
}

/** Is `data` a real snapshot (cards carry their payload) rather than a reduced
 *  export row (T-145)? A pre-0.9 reduced `.fwr` fails this instead of loading
 *  as blank cards — legacy documents are deliberately not read. */
function isSnapshotData(data: SavedGraphData | undefined): boolean {
  return (
    !!data &&
    Array.isArray(data.nodes) &&
    data.nodes.every((n) => !!n && typeof n === "object" && !!n.data && typeof n.data === "object")
  );
}

/** Parse a graph file. Throws on invalid JSON / wrong shape — callers surface it. */
export function parseGraphFile(raw: string): SavedGraph {
  const parsed = JSON.parse(raw) as Partial<LibraryGraphFile>;
  const g = parsed?.graph;
  if (!g || typeof g !== "object" || !g.id || !g.name || !isSnapshotData(g.data)) {
    throw new Error("not a fewer library graph file");
  }
  return g as SavedGraph;
}

/**
 * Fewer graph document (`.fwr`, or any payload carrying that envelope) →
 * `{ name, data }`, or `null` when the bytes are not a snapshot document.
 *
 * The reader every fidelity path shares: Import dialog file origin, drag-drop
 * and Share import. Pure — no store, no FS, no host bridge.
 */
export function parseGraphDocument(raw: string): { name: string; data: SavedGraphData } | null {
  try {
    const graph = parseGraphFile(raw);
    return { name: graph.name, data: graph.data };
  } catch {
    return null;
  }
}
