// Graph save/load data access (T-089 / #301). One interface, two backends:
//   - cloud: the existing /api/graphs fetches (web app, unchanged behavior)
//   - local: the Fewer Library directory (offline desktop)
// The SavedGraphsPanel talks only to this interface, so the swap is here and
// not spread across the component.
import type { SavedGraph, SavedGraphData } from "./savedGraphs";
import { buildGraphSaveBody } from "./savedGraphsModel";
import {
  buildGraphFile,
  emptyManifest,
  graphFileName,
  libraryGraphPath,
  libraryManifestPath,
  manifestRemove,
  manifestUpsert,
  parseGraphFile,
  parseManifest,
  rebuildManifestFromGraphDir,
  savedGraphFrom,
  type LibraryFs,
  type LibraryManifest,
} from "./localLibrary";
import { cloudThemesBackend, localThemesBackend, type ThemesBackend } from "./themesData";
import { isHost, nativeDefaultLibraryDir, nativeFsRead, nativeFsRemove, nativeFsWrite, nativeListDir, nativePickDirectory } from "./nativeShell";
import { getLibraryDir, setLibraryDir } from "./libraryConfig";

export interface GraphSaveInput {
  /** Existing graph id to update in place, or null for a new save. */
  id: string | null;
  name: string;
  data: SavedGraphData;
}

export interface GraphsBackend {
  /** True for the local library: share + version-history UI do not apply. */
  local: boolean;
  list(): Promise<SavedGraph[]>;
  save(input: GraphSaveInput): Promise<void>;
  remove(id: string): Promise<void>;
  setFavorite(id: string, isFavorite: boolean): Promise<void>;
}

/* ------------------------------- cloud ---------------------------------- */

async function cloudList(): Promise<SavedGraph[]> {
  const res = await fetch("/api/graphs");
  if (res.status === 401) return [];
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
  return Array.isArray(json.graphs) ? json.graphs : [];
}

export function cloudGraphsBackend(): GraphsBackend {
  return {
    local: false,
    list: cloudList,
    async save({ id, name, data }) {
      const res = await fetch("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGraphSaveBody(name, data, id)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
    },
    async remove(id) {
      const res = await fetch(`/api/graphs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    async setFavorite(id, is_favorite) {
      const res = await fetch(`/api/graphs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite }),
      });
      if (!res.ok) throw new Error("Pin failed");
    },
  };
}

/* -------------------------------- local --------------------------------- */

export function localGraphsBackend(fs: LibraryFs, root: string): GraphsBackend {
  async function readManifest(): Promise<LibraryManifest> {
    try {
      return parseManifest(await fs.read(libraryManifestPath(root)));
    } catch {
      // Missing or unreadable manifest → empty library; rebuilt on next save.
      return emptyManifest();
    }
  }

  return {
    local: true,
    async list() {
      // Disk is the source of truth when the host can list directories (T-101):
      // scanned libraries reflect files dropped in by hand plus legacy .json
      // entries; the manifest stays the fallback (tests, non-list hosts).
      if (fs.list) {
        const scanned = await rebuildManifestFromGraphDir(fs, root);
        if (scanned) {
          const scannedGraphs: SavedGraph[] = [];
          for (const entry of scanned.graphs) {
            try {
              scannedGraphs.push(parseGraphFile(await fs.read(libraryGraphPath(root, entry.file))));
            } catch {
              // Skip unreadable files.
            }
          }
          // buildManifest keeps newest-updated first.
          return scannedGraphs;
        }
      }
      const man = await readManifest();
      const graphs: SavedGraph[] = [];
      for (const entry of man.graphs) {
        try {
          graphs.push(parseGraphFile(await fs.read(libraryGraphPath(root, entry.file))));
        } catch {
          // Skip unreadable graph files; the manifest row stays for repair.
        }
      }
      // Manifest order is newest-first; keep it stable after partial reads.
      const order = new Map(man.graphs.map((e, i) => [e.id, i]));
      return graphs.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    },
    async save({ id, name, data }) {
      const man = await readManifest();
      const prevId = id ?? null;
      const prevEntry = prevId ? man.graphs.find((g) => g.id === prevId) : undefined;
      const graphId = prevId ?? crypto.randomUUID();
      const prevGraph = prevEntry
        ? await fs
            .read(libraryGraphPath(root, prevEntry.file))
            .then(parseGraphFile)
            .catch(() => null)
        : null;
      const graph = savedGraphFrom(graphId, name, data, prevGraph);
      const file = graphFileName(graph.id, graph.name);
      await fs.write(libraryGraphPath(root, file), JSON.stringify(buildGraphFile(graph), null, 2));
      // A rename changes the file name; drop the old file after the new one lands.
      if (prevEntry && prevEntry.file !== file) {
        await fs.remove(libraryGraphPath(root, prevEntry.file)).catch(() => {});
      }
      const next = manifestUpsert(man, {
        id: graph.id,
        file,
        name: graph.name,
        created_at: graph.created_at,
        updated_at: graph.updated_at,
        ...(graph.is_favorite ? { is_favorite: true } : {}),
        node_count: graph.data?.nodes?.length ?? 0,
      });
      await fs.write(libraryManifestPath(root), JSON.stringify(next, null, 2));
    },
    async remove(id) {
      const man = await readManifest();
      const entry = man.graphs.find((g) => g.id === id);
      let file = entry?.file;
      if (!file && fs.list) {
        // Scanned library: locate the file by id on disk (T-101).
        const scanned = await rebuildManifestFromGraphDir(fs, root);
        file = scanned?.graphs.find((g) => g.id === id)?.file;
      }
      if (file) await fs.remove(libraryGraphPath(root, file)).catch(() => {});
      await fs.write(libraryManifestPath(root), JSON.stringify(manifestRemove(man, id), null, 2));
    },
    async setFavorite(id, isFavorite) {
      const man = await readManifest();
      const entry = man.graphs.find((g) => g.id === id);
      if (!entry) return;
      const graph = await fs
        .read(libraryGraphPath(root, entry.file))
        .then(parseGraphFile)
        .catch(() => null);
      const nextEntry = { ...entry, updated_at: entry.updated_at };
      if (isFavorite) nextEntry.is_favorite = true;
      else delete nextEntry.is_favorite;
      await fs.write(
        libraryManifestPath(root),
        JSON.stringify(manifestUpsert(man, nextEntry), null, 2),
      );
      if (graph) {
        const nextGraph = { ...graph, is_favorite: isFavorite || undefined };
        await fs.write(libraryGraphPath(root, entry.file), JSON.stringify(buildGraphFile(nextGraph), null, 2));
      }
    },
  };
}

/* ------------------------------ selection -------------------------------- */

/** True when the desktop shell has a library folder configured. */
export function hasLocalLibrary(): boolean {
  return isHost() && !!getLibraryDir();
}

/** Pick a library folder via the shell dialog and persist it. Returns the dir or null. */
export async function chooseLibraryDir(): Promise<string | null> {
  const dir = await nativePickDirectory();
  if (dir) {
    const { setLibraryDir } = await import("./libraryConfig");
    setLibraryDir(dir);
  }
  return dir;
}

/** Backend for the current context: local library on desktop, cloud otherwise. */
export function getGraphsBackend(): GraphsBackend {
  // The desktop shell ships no server (T-099): cloud saving cannot work there,
  // so the backend is ALWAYS local — an unset dir means the panel's choose-folder
  // prompt and an empty list until the user picks one.
  if (isHost()) {
    return localGraphsBackend(nativeLibraryFs(), getLibraryDir() ?? "");
  }
  return cloudGraphsBackend();
}

/** Paged dir listing via the host's list_dir (T-101): file names only. */
export async function listGraphDirFiles(dir: string): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += 512) {
    const page = await nativeListDir(dir, offset, 512);
    for (const e of page.entries) if (e.type === "file") names.push(e.name);
    if (page.entries.length === 0 || offset + page.entries.length >= page.total) break;
  }
  return names;
}

/** The host-backed LibraryFs (read/write/remove + list_dir). */
export function nativeLibraryFs(): LibraryFs {
  return {
    read: nativeFsRead,
    write: nativeFsWrite,
    remove: nativeFsRemove,
    list: listGraphDirFiles,
  };
}

/**
 * First run in the shell (T-101): create and persist the default library dir
 * (~/Documents/fewer — the host resolves and mkdirs it) so saving works
 * without a picker round-trip. Returns "" on web or when unavailable.
 */
export async function ensureLibraryDir(): Promise<string> {
  const existing = getLibraryDir();
  if (existing) return existing;
  if (!isHost()) return "";
  try {
    const dir = await nativeDefaultLibraryDir();
    if (dir) setLibraryDir(dir);
    return dir;
  } catch {
    return "";
  }
}

/** Named themes: local .fwtheme files in the shell, cloud rows on the web. */
export function libraryThemesBackend(): ThemesBackend {
  return isHost()
    ? localThemesBackend(nativeLibraryFs(), getLibraryDir())
    : cloudThemesBackend();
}
