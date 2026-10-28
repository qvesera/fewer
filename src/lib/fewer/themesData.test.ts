// Cloud named themes: /api/themes rows (owner-only via RLS).
import { describe, expect, test } from "bun:test";
import { cloudThemesBackend } from "./themesData";
import type { SavedTheme } from "./types";

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
