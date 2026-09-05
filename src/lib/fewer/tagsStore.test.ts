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

test("tagFilter dimming: nodes missing every selected tag get dimmed", () => {
  const s = useGraphStore.getState();
  const a = s.createTag("A");
  const b = s.createTag("B");
  s.assignTag("n1", a.id);
  // Filter by B only → n1 (tag A) is dimmed, n2 (no tags) dimmed.
  useGraphStore.setState({ tagFilter: [b.id] });
  s.applyTagFilter();
  const nodes = useGraphStore.getState().nodes;
  expect(nodes[0].data.dimmed).toBe(true);
  expect(nodes[1].data.dimmed).toBe(true);
  // Now also assign B to n1 → n1 matches (OR), no longer dimmed.
  s.assignTag("n1", b.id);
  s.applyTagFilter();
  expect(useGraphStore.getState().nodes[0].data.dimmed).toBe(false);
});
