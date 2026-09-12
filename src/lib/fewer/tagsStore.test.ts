import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";

function resetStore() {
  useGraphStore.setState({
    nodes: [
      {
        id: "n1",
        type: "folder",
        position: { x: 0, y: 0 },
        data: { label: "Folder", path: "/Folder", type: "folder" },
      },
      {
        id: "n2",
        type: "file",
        position: { x: 0, y: 0 },
        data: { label: "File", path: "/File", type: "file" },
      },
    ] as never,
    edges: [],
    tags: [],
    tagFilter: [],
    past: [],
    future: [],
  });
}

beforeEach(() => resetStore());

test("createTag adds to registry with palette color", () => {
  const { createTag } = useGraphStore.getState();
  const tag = createTag("Important");
  expect(tag.label).toBe("Important");
  expect(tag.color).toMatch(/^#/);
  expect(useGraphStore.getState().tags).toHaveLength(1);
});

test("assignTag / unassignTag mutate node.tagIds", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Bug");
  s.assignTag("n1", tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([tag.id]);
  s.unassignTag("n1", tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([]);
});

test("assignTag is idempotent (no duplicates)", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Dup");
  s.assignTag("n1", tag.id);
  s.assignTag("n1", tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([tag.id]);
});

test("toggleNodeTag flips assignment", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Toggle");
  s.toggleNodeTag("n1", tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([tag.id]);
  s.toggleNodeTag("n1", tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([]);
});

test("deleteTag strips it from all nodes and the registry", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Gone");
  s.assignTag("n1", tag.id);
  s.assignTag("n2", tag.id);
  s.deleteTag(tag.id);
  expect(useGraphStore.getState().tags).toHaveLength(0);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([]);
  expect(useGraphStore.getState().nodes[1].data.tagIds).toEqual([]);
});

test("deleteTag also clears the id from tagFilter", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Filtered");
  s.toggleTagFilter(tag.id);
  expect(useGraphStore.getState().tagFilter).toEqual([tag.id]);
  s.deleteTag(tag.id);
  expect(useGraphStore.getState().tagFilter).toEqual([]);
});

test("tagFilter hides folders without matching descendants and non-matching files", () => {
  const s = useGraphStore.getState();
  const a = s.createTag("A");
  const b = s.createTag("B");
  // n1 folder -> n2 file; n2 carries tag A
  s.assignTag("n2", a.id);
  useGraphStore.setState({
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  } as never);
  // Filter by B only: n2 file (no B) is hidden; n1 folder has no B and no descendant B -> hidden.
  s.setTagFilter([b.id]);
  const { hiddenIds } = useGraphStore.getState();
  expect(hiddenIds).toContain("n2");
  expect(hiddenIds).toContain("n1");
  // Clear the filter.
  s.clearTagFilter();
  expect(useGraphStore.getState().hiddenIds).not.toContain("n2");
  expect(useGraphStore.getState().hiddenIds).not.toContain("n1");
});

test("tagFilter keeps folders that anchor a matching descendant file", () => {
  const s = useGraphStore.getState();
  const a = s.createTag("A");
  s.assignTag("n2", a.id);
  useGraphStore.setState({
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  } as never);
  s.setTagFilter([a.id]);
  const { hiddenIds } = useGraphStore.getState();
  // n2 matches A; ancestor folder n1 is kept as a structural anchor.
  expect(hiddenIds).not.toContain("n2");
  expect(hiddenIds).not.toContain("n1");
});

test("toggleTagFilter toggles a tag in the filter", () => {
  const s = useGraphStore.getState();
  const a = s.createTag("A");
  s.toggleTagFilter(a.id);
  expect(useGraphStore.getState().tagFilter).toEqual([a.id]);
  s.toggleTagFilter(a.id);
  expect(useGraphStore.getState().tagFilter).toEqual([]);
});

test("assignTagToNodes assigns one tag to many nodes", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Batch");
  s.assignTagToNodes(["n1", "n2"], tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([tag.id]);
  expect(useGraphStore.getState().nodes[1].data.tagIds).toEqual([tag.id]);
});

test("assignTagToNodes is idempotent and ignores unknown nodes", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Idem");
  s.assignTagToNodes(["n1"], tag.id);
  s.assignTagToNodes(["n1", "n2", "ghost"], tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([tag.id]);
  expect(useGraphStore.getState().nodes[1].data.tagIds).toEqual([tag.id]);
});

test("unassignTagFromNodes removes a tag from many nodes", () => {
  const s = useGraphStore.getState();
  const tag = s.createTag("Remove");
  s.assignTagToNodes(["n1", "n2"], tag.id);
  s.unassignTagFromNodes(["n1"], tag.id);
  expect(useGraphStore.getState().nodes[0].data.tagIds).toEqual([]);
  expect(useGraphStore.getState().nodes[1].data.tagIds).toEqual([tag.id]);
});
