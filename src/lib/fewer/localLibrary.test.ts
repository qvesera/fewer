// `.fwr` document format: the snapshot envelope every import path reads.
import { describe, expect, test } from "bun:test";
import { parseGraphDocument, parseGraphFile } from "./localLibrary";
import type { SavedGraph, SavedGraphData } from "./savedGraphs";

const data: SavedGraphData = {
  nodes: [
    { id: "n1", position: { x: 0, y: 0 }, data: { label: "root", type: "folder" } },
    { id: "n2", position: { x: 0, y: 100 }, data: { label: "file", type: "file" } },
  ] as SavedGraphData["nodes"],
  edges: [{ id: "e1", source: "n1", target: "n2" }] as SavedGraphData["edges"],
};

const graph: SavedGraph = {
  id: "id-1",
  name: "G",
  data,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const doc = JSON.stringify({ format_version: 1, graph });

describe("fwr document", () => {
  test("round-trips a snapshot", () => {
    const back = parseGraphFile(doc);
    expect(back.id).toBe("id-1");
    expect(back.data.nodes).toHaveLength(2);
  });

  test("parseGraphFile rejects garbage and wrong shapes", () => {
    expect(() => parseGraphFile("not json")).toThrow();
    expect(() => parseGraphFile(JSON.stringify({ format_version: 1 }))).toThrow();
    expect(() => parseGraphFile(JSON.stringify({ graph: { id: "x", name: "y" } }))).toThrow();
  });

  test("parseGraphDocument returns name + data, null for non-documents", () => {
    expect(parseGraphDocument(doc)).toEqual({ name: "G", data });
    expect(parseGraphDocument(JSON.stringify({ nodes: [], edges: [] }))).toBeNull();
  });
});
