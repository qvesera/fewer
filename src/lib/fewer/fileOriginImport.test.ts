// T-145: the file origin has TWO routes and they must stay distinct —
// a Fewer graph document lands whole (ids, positions, tags, groups restored),
// while a raw JSON export is rebuilt from its structure (fresh ids, no groups).
// No mocks anywhere: the module registry is process-wide in bun, so this suite
// drives the real action against the real store.
import { beforeEach, describe, expect, test } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import type { TextFileSource } from "./importFlow";
import { runFileImport } from "./fileOriginImport";
import { buildExportSnapshot, buildFwrDocument } from "./exportUtils";
import type { FewerEdge, FewerNode } from "./types";

function node(id: string, x = 0, y = 0): FewerNode {
  return {
    id,
    type: "folder",
    position: { x, y },
    data: { label: id.toUpperCase(), path: `/${id}`, type: "folder" },
  } as FewerNode;
}

const source = (content: string): TextFileSource => ({
  origin: "file",
  kind: "text",
  content,
  format: "json",
  formatOverride: null,
});

const opts = (): ImportOptions => ({ ...DEFAULT_IMPORT_OPTIONS });

function resetStore() {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    tags: [],
    groups: [],
    hiddenIds: [],
    dataSource: null,
    localRootPath: null,
    past: [],
    future: [],
  });
}

beforeEach(() => resetStore());

describe("runFileImport — graph document route (T-145)", () => {
  test("a .fwr document restores ids, positions, tags, groups and the local root", async () => {
    const tags = [{ id: "t1", label: "art", color: "#ff0000" }];
    const groups = [{ id: "g1", title: "Assets", note: "", memberIds: ["r", "a"] }];
    const doc = buildFwrDocument(
      buildExportSnapshot(
        [node("r", 1, 2), node("a", 40, 5), node("b", 40, 120)],
        [{ id: "e1", source: "r", target: "a" } as FewerEdge],
        { tags, groups, localRootPath: "/tmp/proj" },
      ),
      "My Graph",
    );

    const result = await runFileImport(source(JSON.stringify(doc)), opts());
    expect(result.ok).toBe(true);
    expect(result.title).toBe("Graph opened");
    expect(result.description).toContain("My Graph");

    const s = useGraphStore.getState();
    expect(s.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "r"]);
    expect(s.nodes.find((n) => n.id === "b")!.position).toEqual({ x: 40, y: 120 });
    expect(s.edges.map((e) => e.id)).toEqual(["e1"]);
    expect(s.tags).toEqual(tags);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].memberIds).toEqual(["r", "a"]);
    expect(s.localRootPath).toBe("/tmp/proj");
    expect(s.dataSource).toBe("file");
  });

  test("import options cannot drop cards from a document — there is no tree to filter", async () => {
    const doc = buildFwrDocument(
      buildExportSnapshot([node("r"), node("a")], [], {}),
      "No Filter",
    );
    const restrictive = opts();
    restrictive.extensions = ["ts"]; // would drop everything in a tree import
    const result = await runFileImport(source(JSON.stringify(doc)), restrictive);
    expect(result.ok).toBe(true);
    expect(useGraphStore.getState().nodes).toHaveLength(2);
  });
});

describe("runFileImport — structural JSON route", () => {
  test("a raw JSON export is rebuilt with fresh ids and carries no groups", async () => {
    const payload = {
      meta: { application: "fewer" },
      stats: null,
      nodes: [
        { id: "r", label: "show", path: "show", type: "folder", position: { x: 1, y: 2 } },
        { id: "a", label: "App.tsx", path: "show/App.tsx", type: "file", extension: "tsx" },
      ],
      edges: [{ id: "e1", source: "r", target: "a" }],
    };
    const result = await runFileImport(source(JSON.stringify(payload)), opts());
    expect(result.ok).toBe(true);
    expect(result.title).toBe("Graph built from file");

    const s = useGraphStore.getState();
    expect(s.nodes).toHaveLength(2);
    expect(s.nodes.every((n) => n.id.startsWith("file-import"))).toBe(true);
    expect(s.groups).toEqual([]);
    expect(s.tags).toEqual([]);
    expect(s.localRootPath).toBeNull();
  });

  test("a document followed by a structural import leaves no stale groups behind", async () => {
    const doc = buildFwrDocument(
      buildExportSnapshot([node("r")], [], {
        groups: [{ id: "g1", title: "Only", note: "", memberIds: ["r"] }],
      }),
      "With Groups",
    );
    await runFileImport(source(JSON.stringify(doc)), opts());
    expect(useGraphStore.getState().groups).toHaveLength(1);

    const plain = { nodes: [{ id: "x", label: "root", path: "root", type: "folder" }], edges: [] };
    await runFileImport(source(JSON.stringify(plain)), opts());
    // The old frame would point at an id the new graph never had (T-145).
    expect(useGraphStore.getState().groups).toEqual([]);
  });

  test("a reduced (pre-0.9) .fwr envelope fails loudly instead of loading blank cards", async () => {
    const reduced = {
      format_version: 1,
      app: "fewer",
      graph: {
        id: "fwr_old",
        name: "Old",
        data: { nodes: [{ id: "r", label: "proj", path: "proj", type: "folder" }], edges: [] },
      },
    };
    const result = await runFileImport(source(JSON.stringify(reduced)), opts());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("missing 'nodes' array");
    expect(useGraphStore.getState().nodes).toHaveLength(0);
  });
});
