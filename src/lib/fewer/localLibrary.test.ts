// T-089 / #301: Fewer Library format + local backend round-trip.
import { describe, expect, test } from "bun:test";
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
  slugify,
  type LibraryFs,
} from "./localLibrary";
import { localGraphsBackend } from "./graphsData";
import type { SavedGraphData } from "./savedGraphs";

const data: SavedGraphData = {
  nodes: [
    { id: "n1", position: { x: 0, y: 0 }, data: { label: "root", type: "folder" } },
    { id: "n2", position: { x: 0, y: 100 }, data: { label: "file", type: "file" } },
  ] as SavedGraphData["nodes"],
  edges: [{ id: "e1", source: "n1", target: "n2" }] as SavedGraphData["edges"],
};

/** In-memory LibraryFs keyed by full path. */
function memFs(seed: Record<string, string> = {}): LibraryFs & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async read(p) {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return v;
    },
    async write(p, c) {
      files.set(p, c);
    },
    async remove(p) {
      files.delete(p);
    },
  };
}

describe("localLibrary format", () => {
  test("slugify normalizes names", () => {
    expect(slugify("My Project (v2)!")).toBe("my-project-v2");
    expect(slugify("---")).toBe("graph");
    expect(slugify("ÄÖÜ Studio")).toBe("aou-studio");
  });

  test("graph file name embeds slug + id prefix", () => {
    expect(graphFileName("abcd1234-5678", "My Graph")).toBe("my-graph-abcd1234.json");
  });

  test("graph file round-trips through build/parse", () => {
    const g = savedGraphFrom("id-1", "G", data);
    const raw = JSON.stringify(buildGraphFile(g));
    const back = parseGraphFile(raw);
    expect(back.id).toBe("id-1");
    expect(back.data.nodes).toHaveLength(2);
  });

  test("parseGraphFile rejects garbage and wrong shapes", () => {
    expect(() => parseGraphFile("not json")).toThrow();
    expect(() => parseGraphFile(JSON.stringify({ format_version: 1 }))).toThrow();
    expect(() => parseGraphFile(JSON.stringify({ graph: { id: "x", name: "y" } }))).toThrow();
  });

  test("manifest rejects unknown format_version", () => {
    expect(() => parseManifest(JSON.stringify({ format_version: 99, graphs: [] }))).toThrow();
    const m = parseManifest(JSON.stringify(emptyManifest()));
    expect(m.graphs).toEqual([]);
  });

  test("manifestUpsert is newest-first and idempotent by id", () => {
    let m = emptyManifest();
    const older = { ...savedGraphFrom("a", "A", data, null), created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
    const newer = { ...savedGraphFrom("b", "B", data, null), created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" };
    m = manifestUpsert(m, { id: older.id, file: graphFileName(older.id, older.name), name: older.name, created_at: older.created_at, updated_at: older.updated_at, node_count: 2 });
    m = manifestUpsert(m, { id: newer.id, file: graphFileName(newer.id, newer.name), name: newer.name, created_at: newer.created_at, updated_at: newer.updated_at, node_count: 2 });
    expect(m.graphs.map((g) => g.id)).toEqual(["b", "a"]);
    // Re-save "a" with a newer timestamp → moves to front, no duplicate.
    m = manifestUpsert(m, { id: "a", file: graphFileName("a", "A"), name: "A", created_at: older.created_at, updated_at: "2026-02-01T00:00:00Z", node_count: 2 });
    expect(m.graphs.map((g) => g.id)).toEqual(["a", "b"]);
    expect(manifestRemove(m, "a").graphs.map((g) => g.id)).toEqual(["b"]);
  });
});

describe("localGraphsBackend", () => {
  const root = "/home/u/Fewer Library";

  test("save → list → load round-trip", async () => {
    const fs = memFs();
    const be = localGraphsBackend(fs, root);
    await be.save({ id: null, name: "Proj One", data });
    const graphs = await be.list();
    expect(graphs).toHaveLength(1);
    expect(graphs[0].name).toBe("Proj One");
    expect(graphs[0].data.nodes).toHaveLength(2);
    expect(fs.files.has(libraryManifestPath(root))).toBe(true);
  });

  test("update in place keeps id and created_at, refreshes data", async () => {
    const fs = memFs();
    const be = localGraphsBackend(fs, root);
    await be.save({ id: null, name: "Proj", data });
    const [first] = await be.list();
    await be.save({ id: first.id, name: "Proj", data: { ...data, nodes: [data.nodes[0]] } });
    const after = await be.list();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(first.id);
    expect(after[0].created_at).toBe(first.created_at);
    expect(after[0].data.nodes).toHaveLength(1);
  });

  test("rename rewrites the file name and drops the old file", async () => {
    const fs = memFs();
    const be = localGraphsBackend(fs, root);
    await be.save({ id: null, name: "Old Name", data });
    const [g] = await be.list();
    await be.save({ id: g.id, name: "New Name", data: g.data });
    const files = [...fs.files.keys()].filter((p) => p.includes("/graphs/"));
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("new-name-");
  });

  test("favorite flips manifest + file and survives list", async () => {
    const fs = memFs();
    const be = localGraphsBackend(fs, root);
    await be.save({ id: null, name: "Fav", data });
    const [g] = await be.list();
    await be.setFavorite(g.id, true);
    const after = await be.list();
    expect(after[0].is_favorite).toBe(true);
    await be.setFavorite(g.id, false);
    expect((await be.list())[0].is_favorite).toBeFalsy();
  });

  test("remove deletes the graph file and the manifest row", async () => {
    const fs = memFs();
    const be = localGraphsBackend(fs, root);
    await be.save({ id: null, name: "Doomed", data });
    const [g] = await be.list();
    await be.remove(g.id);
    expect(await be.list()).toEqual([]);
    expect([...fs.files.keys()].filter((p) => p.includes("/graphs/"))).toEqual([]);
  });

  test("corrupt manifest falls back to empty; corrupt graph file is skipped", async () => {
    const fs = memFs({
      [libraryManifestPath(root)]: "{corrupt",
    });
    const be = localGraphsBackend(fs, root);
    expect(await be.list()).toEqual([]);
    // A manifest row pointing at a missing file doesn't break the listing.
    fs.files.set(
      libraryManifestPath(root),
      JSON.stringify({
        format_version: 1,
        app: "fewer",
        graphs: [{ id: "x", file: "x-x.json", name: "X", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", node_count: 0 }],
      }),
    );
    expect(await be.list()).toEqual([]);
  });

  test("graph file path joins under graphs/", () => {
    expect(libraryGraphPath(root, "a.json")).toBe("/home/u/Fewer Library/graphs/a.json");
    expect(libraryManifestPath(root + "/")).toBe("/home/u/Fewer Library/library.json");
  });
});
