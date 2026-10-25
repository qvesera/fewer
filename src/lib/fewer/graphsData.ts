// Graph save/load data access (T-089 / #301). One interface, one backend:
//   - cloud: the existing /api/graphs fetches (web app, unchanged behavior)
// The SavedGraphsPanel talks only to this interface, so a future backend swap
// stays here and not spread across the component.
import type { SavedGraph, SavedGraphData } from "./savedGraphs";
import { buildGraphSaveBody } from "./savedGraphsModel";

export interface GraphSaveInput {
  /** Existing graph id to update in place, or null for a new save. */
  id: string | null;
  name: string;
  data: SavedGraphData;
}

export interface GraphsBackend {
  list(): Promise<SavedGraph[]>;
  save(input: GraphSaveInput): Promise<void>;
  remove(id: string): Promise<void>;
  setFavorite(id: string, isFavorite: boolean): Promise<void>;
}

async function cloudList(): Promise<SavedGraph[]> {
  const res = await fetch("/api/graphs");
  if (res.status === 401) return [];
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
  return Array.isArray(json.graphs) ? json.graphs : [];
}

export function cloudGraphsBackend(): GraphsBackend {
  return {
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

/** Backend for the current context. */
export function getGraphsBackend(): GraphsBackend {
  return cloudGraphsBackend();
}
