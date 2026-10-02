// Local graph library format (T-089 / #301): the on-disk contract for the
// offline desktop build. A library is a directory the user chooses:
//
//   <library>/library.json          manifest (index of graphs)
//   <library>/graphs/<file>.json    one SavedGraph-shaped file per graph
//
// Graph files reuse the SavedGraph / SavedGraphData shape the web app already
// saves (same snapshot schema the Supabase rows hold), so a library graph and
// a cloud graph are the same document — importable on web and desktop alike.
//
// Pure module: no FS, no Tauri. The FS adapter lives in graphsData.ts.
import type { SavedGraph, SavedGraphData } from "./savedGraphs";

/** Bump when the graph-file or manifest shape changes incompatibly. */
export const LIBRARY_FORMAT_VERSION = 1;

/** One graph as stored on disk. */
export interface LibraryGraphFile {
  format_version: number;
  graph: SavedGraph;
}

/** Manifest row: enough to list the sidebar without reading every graph file. */
export interface LibraryManifestEntry {
  id: string;
  file: string;
  name: string;
  created_at: string;
  updated_at: string;
  is_favorite?: boolean;
  node_count: number;
}

export interface LibraryManifest {
  format_version: number;
  app: "fewer";
  graphs: LibraryManifestEntry[];
}

/** Filesystem operations the library needs. Desktop: Tauri commands; tests: fakes. */
export interface LibraryFs {
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Path helpers — posix-style joins; the Rust side normalizes separators. */
export function libraryManifestPath(root: string): string {
  return `${trimSlash(root)}/library.json`;
}
export function libraryGraphPath(root: string, file: string): string {
  return `${trimSlash(root)}/graphs/${file}`;
}
function trimSlash(root: string): string {
  return root.endsWith("/") || root.endsWith("\\") ? root.slice(0, -1) : root;
}

/** Stable, filesystem-safe slug for a graph name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks first so "ÄÖÜ" → "aou", not "a-o-u".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "graph";
}

/** Graph file name: `<slug>-<id-prefix>.json`. Id prefix keeps renames collision-free. */
export function graphFileName(id: string, name: string): string {
  return `${slugify(name)}-${id.slice(0, 8)}.json`;
}

export function buildGraphFile(graph: SavedGraph): LibraryGraphFile {
  return { format_version: LIBRARY_FORMAT_VERSION, graph };
}

/** Parse a graph file. Throws on invalid JSON / wrong shape — callers surface it. */
export function parseGraphFile(raw: string): SavedGraph {
  const parsed = JSON.parse(raw) as Partial<LibraryGraphFile>;
  const g = parsed?.graph;
  if (!g || typeof g !== "object" || !g.id || !g.name || !g.data || !Array.isArray(g.data.nodes)) {
    throw new Error("not a fewer library graph file");
  }
  return g as SavedGraph;
}

export function buildManifest(graphs: SavedGraph[]): LibraryManifest {
  return {
    format_version: LIBRARY_FORMAT_VERSION,
    app: "fewer",
    graphs: graphs.map((g) => manifestEntryFor(g)),
  };
}

export function manifestEntryFor(g: SavedGraph, file?: string): LibraryManifestEntry {
  return {
    id: g.id,
    file: file ?? graphFileName(g.id, g.name),
    name: g.name,
    created_at: g.created_at,
    updated_at: g.updated_at,
    ...(g.is_favorite ? { is_favorite: true } : {}),
    node_count: g.data?.nodes?.length ?? 0,
  };
}

/** Parse a manifest; unknown/newer format_version throws (fail-safe, no guessing). */
export function parseManifest(raw: string): LibraryManifest {
  const m = JSON.parse(raw) as Partial<LibraryManifest>;
  if (!m || m.format_version !== LIBRARY_FORMAT_VERSION || !Array.isArray(m.graphs)) {
    throw new Error(`unsupported library manifest (format_version=${m?.format_version})`);
  }
  return m as LibraryManifest;
}

export function emptyManifest(): LibraryManifest {
  return { format_version: LIBRARY_FORMAT_VERSION, app: "fewer", graphs: [] };
}

/** Insert-or-replace a manifest row by id, newest-updated first. */
export function manifestUpsert(man: LibraryManifest, entry: LibraryManifestEntry): LibraryManifest {
  const rest = man.graphs.filter((g) => g.id !== entry.id);
  return { ...man, graphs: [entry, ...rest].sort((a, b) => b.updated_at.localeCompare(a.updated_at)) };
}

export function manifestRemove(man: LibraryManifest, id: string): LibraryManifest {
  return { ...man, graphs: man.graphs.filter((g) => g.id !== id) };
}

/** Snapshot → SavedGraph, with the fields the panel relies on defaulted. */
export function savedGraphFrom(
  id: string,
  name: string,
  data: SavedGraphData,
  prev?: SavedGraph | null,
): SavedGraph {
  const now = new Date().toISOString();
  return {
    id,
    name,
    data,
    created_at: prev?.created_at ?? now,
    updated_at: now,
    is_favorite: prev?.is_favorite,
    share: prev?.share ?? null,
  };
}
