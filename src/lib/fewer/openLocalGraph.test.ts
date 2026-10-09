import { describe, expect, test } from "bun:test";
import { isGraphDocument, loadGraphFromPath, parseGraphDocument } from "./openLocalGraph";

const DOC = JSON.stringify({
  format_version: 1,
  app: "fewer",
  graph: {
    id: "g1",
    name: "My Graph",
    data: {
      nodes: [{ id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "root", path: "root", type: "folder" } }],
      edges: [],
    },
  },
});

describe("isGraphDocument", () => {
  test("accepts .fwr in any case, nothing else", () => {
    expect(isGraphDocument("/home/u/plan.fwr")).toBe(true);
    expect(isGraphDocument("/home/u/PLAN.FWR")).toBe(true);
    expect(isGraphDocument("/home/u/plan.json")).toBe(false);
    expect(isGraphDocument("/home/u/plan.fwr.bak")).toBe(false);
  });
});

describe("parseGraphDocument", () => {
  test("reads the name and graph data out of the envelope", () => {
    const doc = parseGraphDocument(DOC);
    expect(doc?.name).toBe("My Graph");
    expect(doc?.data.nodes).toHaveLength(1);
  });

  test("returns null for bytes that are not a Fewer document", () => {
    expect(parseGraphDocument("not json at all")).toBeNull();
    expect(parseGraphDocument(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(parseGraphDocument(JSON.stringify({ graph: { id: "g", name: "n" } }))).toBeNull();
  });
});

describe("loadGraphFromPath", () => {
  test("reports a read failure without touching the store", async () => {
    const result = await loadGraphFromPath("/missing.fwr", async () => {
      throw new Error("ENOENT: no such file");
    });
    expect(result.ok).toBe(false);
    expect(result.title).toBe("Could not open the file");
    expect(result.error).toContain("ENOENT");
  });

  test("reports non-Fewer bytes as 'Not a Fewer graph'", async () => {
    const result = await loadGraphFromPath("/tmp/notes.txt", async () => "<html>hi</html>");
    expect(result.ok).toBe(false);
    expect(result.title).toBe("Not a Fewer graph");
    // The hint must send the user to Import rather than leaving them stuck.
    expect(result.error).toContain("Import");
  });
});
