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
  savedGraphFrom,
  type LibraryFs,
  type LibraryManifest,
} from "./localLibrary";
import { isHost, nativeFsRead, nativeFsRemove, nativeFsWrite, nativePickDirectory } from "./nativeShell";
import { getLibraryDir } from "./libraryConfig";

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
      if (entry) await fs.remove(libraryGraphPath(root, entry.file)).catch(() => {});
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
    return localGraphsBackend(
      {
        read: nativeFsRead,
        write: nativeFsWrite,
        remove: nativeFsRemove,
      },
      getLibraryDir() ?? "",
    );
  }
  return cloudGraphsBackend();
}
