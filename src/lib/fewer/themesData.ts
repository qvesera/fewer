// Named custom themes as files (T-101): the standalone's replacement for the
// cloud `saved_themes` rows. One file per theme:
//
//   <library>/themes/<slug>.fwtheme       { format_version, app:"fewer",
//                                           name, theme, created_at, updated_at }
//
// The envelope mirrors the cloud shape (`name` + `theme`) so a file is
// portable web↔desktop. Pure module: no FS, no host — the adapter lives in
// graphsData.ts (same pattern as localGraphsBackend). The optional `list`
// on LibraryFs drives scanning; without it, tests use in-memory fakes.
import type { SavedTheme } from "./types";
import {
  buildThemeFile,
  isThemeFile,
  libraryThemePath,
  parseThemeFile,
  themeFileName,
  type LibraryFs,
} from "./localLibrary";

/** Theme persistence, cloud or local. The dialog speaks only this. */
export interface ThemesBackend {
  local: boolean;
  list(): Promise<SavedTheme[]>;
  /** Save under `name`. `prevId` renames in place (cloud upsert parity). */
  save(name: string, theme: unknown, prevId?: string): Promise<SavedTheme>;
  remove(id: string): Promise<void>;
}

function toSavedTheme(file: ReturnType<typeof parseThemeFile>, id: string): SavedTheme {
  return {
    id,
    name: file.name,
    theme: file.theme as SavedTheme["theme"],
    created_at: file.created_at,
    updated_at: file.updated_at,
  };
}

/** Local theme library rooted at `root` (the graph library dir). */
export function localThemesBackend(fs: LibraryFs, root: string): ThemesBackend {
  return {
    local: true,
    async list() {
      if (!fs.list) return [];
      let names: string[];
      try {
        names = await fs.list(`${root.replace(/\/$/, "")}/themes`);
      } catch {
        return [];
      }
      const out: SavedTheme[] = [];
      for (const name of names) {
        if (!isThemeFile(name)) continue;
        try {
          out.push(toSavedTheme(parseThemeFile(await fs.read(libraryThemePath(root, name))), name));
        } catch {
          // Skip unreadable files.
        }
      }
      return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async save(name, theme, prevId) {
      // Rename: write the new file, drop the old one (graph-save parity).
      const file = themeFileName(name);
      const existing = prevId && prevId !== file ? prevId : null;
      const prev = existing
        ? await fs.read(libraryThemePath(root, existing)).then((r) => parseThemeFile(r)).catch(() => null)
        : null;
      const doc = buildThemeFile(name, theme);
      if (prev?.created_at) doc.created_at = prev.created_at;
      await fs.write(libraryThemePath(root, file), JSON.stringify(doc, null, 2));
      if (existing) await fs.remove(libraryThemePath(root, existing)).catch(() => {});
      return toSavedTheme(doc, file);
    },
    async remove(id) {
      await fs.remove(libraryThemePath(root, id)).catch(() => {});
    },
  };
}

/** Cloud theme library (the web app): /api/themes rows, owner-only via RLS. */
export function cloudThemesBackend(): ThemesBackend {
  return {
    local: false,
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
