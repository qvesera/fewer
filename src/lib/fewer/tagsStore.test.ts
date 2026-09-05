import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";

function resetStore() {
  useGraphStore.setState({
    nodes: [
      { id: "n1", type: "folder", position: { x: 0, y: 0 }, data: { label: "Folder", path: "/Folder", type: "folder" } },
      { id: "n2", type: "file", position: { x: 0, y: 0 }, data: { label: "File", path: "/File", type: "file" } },
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

test("tagFilter hides non-matching files via hiddenIds", () => {
  const s = useGraphStore.getState();
  const a = s.createTag("A");
  const b = s.createTag("B");
  s.assignTag("n1", a.id);
  // Filter by B only → file n2 (no tags) should be hidden, folder n1 stays.
  s.setTagFilter([b.id]);
  const { hiddenIds } = useGraphStore.getState();
  expect(hiddenIds).toContain("n2");
  // Folder is never hidden by tag filter.
  expect(hiddenIds).not.toContain("n1");
  // Clear the filter.
  s.clearTagFilter();
  expect(useGraphStore.getState().hiddenIds).not.toContain("n2");
});

test("toggleTagFilter toggles a tag in the filter", () => {
  const s = useGraphStore.getState();
  const a = s.createTag("A");
  s.toggleTagFilter(a.id);
  expect(useGraphStore.getState().tagFilter).toEqual([a.id]);
  s.toggleTagFilter(a.id);
  expect(useGraphStore.getState().tagFilter).toEqual([]);
});
