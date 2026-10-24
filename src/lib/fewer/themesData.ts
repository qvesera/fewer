// Named custom themes (T-101): `/api/themes` rows, owner-only via RLS.
//
// The dialog speaks only this interface, so the storage detail stays here.
import type { SavedTheme } from "./types";

/** Theme persistence. The dialog speaks only this. */
export interface ThemesBackend {
  list(): Promise<SavedTheme[]>;
  /** Save under `name`. `prevId` renames in place (cloud upsert parity). */
  save(name: string, theme: unknown, prevId?: string): Promise<SavedTheme>;
  remove(id: string): Promise<void>;
}

/** Cloud theme library (the web app): /api/themes rows, owner-only via RLS. */
export function cloudThemesBackend(): ThemesBackend {
  return {
    async list() {
      const res = await fetch("/api/themes");
      if (res.status === 401) return [];
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to load (${res.status})`);
      return Array.isArray(json.themes) ? (json.themes as SavedTheme[]) : [];
    },
    async save(name, theme, prevId) {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prevId, name, theme }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      return json.theme as SavedTheme;
    },
    async remove(id) {
      const res = await fetch(`/api/themes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
  };
}
