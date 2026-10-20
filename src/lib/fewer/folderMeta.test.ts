import { describe, expect, test } from "bun:test";
import { FOLDER_META_VERSION, applyFolderMeta, captureFolderMeta, parseFolderMeta } from "./folderMeta";
import type { FewerNode } from "./types";
import type { Group } from "./groups";
import type { Tag } from "./tags";

// Pure document round-trip (T-203): node ids are fresh uuids on every folder
// walk, so the document keys everything by the store's relative node paths.

const node = (id: string, path: string, tagIds?: string[]): FewerNode =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: { label: path.split("/").pop(), path, type: "file", ...(tagIds ? { tagIds } : {}) },
  }) as unknown as FewerNode;

const TAGS: Tag[] = [
  { id: "t1", label: "Core", color: "#ff0000" },
  { id: "t2", label: "Later", color: "#00ff00" },
] as Tag[];

const GROUP: Group[] = [
  { id: "g1", title: "Src", note: "", memberIds: ["n-a", "n-b"], color: "#0000ff" },
] as Group[];

const NODES = [node("n-a", "app/src/a.ts", ["t1"]), node("n-b", "app/src/b.ts"), node("n-c", "app/README.md")];

describe("captureFolderMeta", () => {
  test("keys tags and memberships by path, not by node id", () => {
    const meta = captureFolderMeta({ root: "/data/app", nodes: NODES, tags: TAGS, groups: GROUP });
    expect(meta.version).toBe(FOLDER_META_VERSION);
    expect(meta.nodeTags).toEqual({ "app/src/a.ts": ["t1"] });
    expect(meta.groups[0]?.memberIds).toEqual(["app/src/a.ts", "app/src/b.ts"]);
  });
});

describe("applyFolderMeta", () => {
  test("re-attaches tags and memberships onto a re-imported graph (new ids)", () => {
    const meta = captureFolderMeta({ root: "/data/app", nodes: NODES, tags: TAGS, groups: GROUP });
    // Same paths, brand-new ids — exactly what a folder re-open produces.
    const fresh = [node("x1", "app/src/a.ts"), node("x2", "app/src/b.ts"), node("x3", "app/README.md")];
    const patch = applyFolderMeta(meta, fresh);
    expect(patch.tags).toEqual(TAGS);
    expect(patch.nodes[0]?.data.tagIds).toEqual(["t1"]);
    expect(patch.nodes[1]?.data.tagIds).toBeUndefined();
    expect(patch.groups[0]?.memberIds).toEqual(["x1", "x2"]);
  });

  test("dangling paths degrade: members and tag refs are dropped, never crash", () => {
    const meta = captureFolderMeta({ root: "/data/app", nodes: NODES, tags: TAGS, groups: GROUP });
    const shrunk = [node("y1", "app/src/a.ts")]; // b.ts gone from disk
    const patch = applyFolderMeta(meta, shrunk);
    expect(patch.groups[0]?.memberIds).toEqual(["y1"]);
    // A tag id missing from the registry is pruned from the node.
    const noRegistry = { ...meta, tags: [] as Tag[] };
    const pruned = applyFolderMeta(noRegistry, fresh());
    expect(pruned.nodes[0]?.data.tagIds).toEqual([]);
  });
});

function fresh(): FewerNode[] {
  return [node("z1", "app/src/a.ts", ["t1"])];
}

describe("parseFolderMeta", () => {
  test("round-trips through JSON", () => {
    const meta = captureFolderMeta({ root: "/data/app", nodes: NODES, tags: TAGS, groups: GROUP });
    expect(parseFolderMeta(JSON.stringify(meta))).toEqual(meta);
  });

  test("absent / corrupt / foreign shapes are null", () => {
    expect(parseFolderMeta(null)).toBeNull();
    expect(parseFolderMeta("not json")).toBeNull();
    expect(parseFolderMeta(JSON.stringify({ version: 999, root: "/x", tags: [], groups: [], nodeTags: {} }))).toBeNull();
    expect(parseFolderMeta(JSON.stringify({ version: FOLDER_META_VERSION, root: "/x", tags: "no" }))).toBeNull();
  });
});