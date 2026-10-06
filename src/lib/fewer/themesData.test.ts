// T-101 — local named themes as .fwtheme files (the standalone's replacement
// for cloud saved_themes rows). In-memory LibraryFs fakes; no host needed.
import { describe, expect, test } from "bun:test";
import { localThemesBackend, cloudThemesBackend } from "./themesData";
import { parseThemeFile, type LibraryFs } from "./localLibrary";
import type { SavedTheme } from "./types";

/** In-memory fs with a `list` over the same keys (names only, basenames). */
function memFs(initial: Record<string, string> = {}): LibraryFs & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async read(path) {
      const v = files.get(path);
      if (v == null) throw new Error(`no such file: ${path}`);
      return v;
    },
    async write(path, contents) {
      files.set(path, contents);
    },
    async remove(path) {
      files.delete(path);
    },
    async list(dir) {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          if (!rest.includes("/")) names.add(rest);
        }
      }
      return [...names];
    },
  };
}

const ROOT = "/lib/fewer";

describe("localThemesBackend", () => {
  test("save → list → remove round-trips through .fwtheme files", async () => {
    const fs = memFs();
    const backend = localThemesBackend(fs, ROOT);

    const saved = await backend.save("Ocean Blue", { mode: "custom" });
    expect(saved.name).toBe("Ocean Blue");
    expect(saved.id).toBe("ocean-blue.fwtheme");
    expect(fs.files.has("/lib/fewer/themes/ocean-blue.fwtheme")).toBe(true);

    const listed = await backend.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Ocean Blue");
    expect(listed[0].theme as unknown).toEqual({ mode: "custom" });

    await backend.remove(saved.id);
    expect(await backend.list()).toHaveLength(0);
  });

  test("rename writes the new file and drops the old one", async () => {
    const fs = memFs();
    const backend = localThemesBackend(fs, ROOT);
    const first = await backend.save("Old Name", { mode: "custom" });
    const renamed = await backend.save("New Name", { mode: "custom" }, first.id);

    expect(renamed.id).toBe("new-name.fwtheme");
    const keys = [...fs.files.keys()];
    expect(keys).toContain("/lib/fewer/themes/new-name.fwtheme");
    expect(keys).not.toContain("/lib/fewer/themes/old-name.fwtheme");
  });

  test("tolerates .fwtheme.json names and skips unreadable files", async () => {
    const doc = JSON.stringify({
      format_version: 1,
      app: "fewer",
      name: "Hand Edited",
      theme: { mode: "dark" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
    const fs = memFs({
      "/lib/fewer/themes/hand-edited.fwtheme.json": doc,
      "/lib/fewer/themes/broken.fwtheme": "not json",
      "/lib/fewer/themes/readme.txt": "ignore me",
    });
    const listed = await localThemesBackend(fs, ROOT).list();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("Hand Edited");
  });

  test("empty or missing themes dir lists as empty", async () => {
    expect(await localThemesBackend(memFs(), ROOT).list()).toEqual([]);
  });
});

describe("theme file envelope", () => {
  test("parseThemeFile rejects garbage and non-envelope shapes", () => {
    expect(() => parseThemeFile("not json")).toThrow();
    expect(() => parseThemeFile(JSON.stringify({ name: "x" }))).toThrow();
    expect(() => parseThemeFile(JSON.stringify({ format_version: 2, app: "fewer", name: "x", theme: {} }))).toThrow();
  });
});

describe("cloudThemesBackend", () => {
  test("list treats 401 as empty, not an error", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    try {
      expect(await cloudThemesBackend().list()).toEqual([]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  test("save unwraps the { theme } envelope from /api/themes", async () => {
    const orig = globalThis.fetch;
    const row: SavedTheme = {
      id: "t1",
      name: "X",
      theme: { mode: "custom" } as unknown as SavedTheme["theme"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ theme: row }), { status: 200 })) as unknown as typeof fetch;
    try {
      const saved = await cloudThemesBackend().save("X", { mode: "custom" });
      expect(saved.id).toBe("t1");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
