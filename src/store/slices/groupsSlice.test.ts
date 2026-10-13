import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";

function resetStore() {
  useGraphStore.setState({
    nodes: [
      { id: "n1", type: "folder", position: { x: 0, y: 0 }, style: { width: 100, height: 50 },
        data: { label: "Folder", path: "/Folder", type: "folder" } },
      { id: "n2", type: "file", position: { x: 200, y: 0 }, style: { width: 100, height: 50 },
        data: { label: "File", path: "/File", type: "file" } },
      { id: "n3", type: "file", position: { x: 400, y: 0 }, style: { width: 100, height: 50 },
        data: { label: "Other", path: "/Other", type: "file" } },
    ] as never,
    edges: [],
    groups: [],
    hiddenIds: [],
    independentlyHiddenIds: [],
    past: [],
    future: [],
  });
}

beforeEach(() => resetStore());

test("addGroup keeps only on-canvas members and records one undo op", () => {
  const before = useGraphStore.getState().past.length;
  const id = useGraphStore.getState().addGroup(["n1", "n2", "ghost"], "Assets");
  expect(id).toMatch(/^g-/);
  const state = useGraphStore.getState();
  expect(state.groups).toHaveLength(1);
  expect(state.groups[0].memberIds).toEqual(["n1", "n2"]); // "ghost" dropped
  expect(state.past).toHaveLength(before + 1);
  expect(state.past[state.past.length - 1].ops[0].type).toBe("groups");
});

test("addGroup with nothing on the canvas is a no-op", () => {
  expect(useGraphStore.getState().addGroup(["nope"], "Empty")).toBeNull();
  expect(useGraphStore.getState().groups).toHaveLength(0);
  expect(useGraphStore.getState().past).toHaveLength(0);
});

test("renameGroup / setGroupNote / removeGroup mutate the group", () => {
  const s = useGraphStore.getState();
  const id = s.addGroup(["n1"], "Draft")!;
  useGraphStore.getState().renameGroup(id, "Assets");
  useGraphStore.getState().setGroupNote(id, "shipping Q4");
  expect(useGraphStore.getState().groups[0]).toMatchObject({
    title: "Assets",
    note: "shipping Q4",
  });
  useGraphStore.getState().removeGroup(id);
  expect(useGraphStore.getState().groups).toHaveLength(0);
});

test("setGraph replaces the graph and drops the groups that described the old ids (T-145)", () => {
  useGraphStore.getState().setGroups([{ id: "g-1", title: "Old", note: "", memberIds: ["n1"] }]);
  useGraphStore.getState().setGraph(
    [
      { id: "fresh-1", type: "folder", position: { x: 0, y: 0 }, data: { label: "New", path: "/New", type: "folder" } },
    ] as never,
    [],
    false,
  );
  // Structural builders mint fresh ids, so the old membership cannot map.
  expect(useGraphStore.getState().groups).toEqual([]);
  // A snapshot import sets its own groups immediately after (applySnapshot).
  useGraphStore.getState().setGroups([{ id: "g-2", title: "New", note: "", memberIds: ["fresh-1"] }]);
  expect(useGraphStore.getState().groups).toHaveLength(1);
});

test("setGroups replaces the list without an undo entry", () => {
  const before = useGraphStore.getState().past.length;
  useGraphStore.getState().setGroups([
    { id: "g-9", title: "Loaded", note: "", memberIds: ["n1"] },
  ]);
  expect(useGraphStore.getState().groups).toHaveLength(1);
  expect(useGraphStore.getState().past).toHaveLength(before); // load path, not an edit
});

test("collapse hides the members; expand reveals them", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsed(id);
  expect(useGraphStore.getState().groups[0].collapsed).toBe(true);
  expect(useGraphStore.getState().hiddenIds).toEqual(expect.arrayContaining(["n1", "n2"]));

  useGraphStore.getState().toggleGroupCollapsed(id);
  expect(useGraphStore.getState().groups[0].collapsed).toBeUndefined();
  expect(useGraphStore.getState().hiddenIds).not.toContain("n1");
  expect(useGraphStore.getState().hiddenIds).not.toContain("n2");
});

test("expand never reveals a card the user hid directly", () => {
  useGraphStore.setState({ independentlyHiddenIds: ["n2"] });
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsed(id); // hides both
  useGraphStore.getState().toggleGroupCollapsed(id); // expand
  const { hiddenIds } = useGraphStore.getState();
  expect(hiddenIds).not.toContain("n1");
  expect(hiddenIds).toContain("n2"); // independently hidden stays hidden
});

test("setGroupColor sets a hex color, normalizes it, and clears back to default", () => {
  const id = useGraphStore.getState().addGroup(["n1"], "Cluster")!;
  useGraphStore.getState().setGroupColor(id, "#A78BFA");
  expect(useGraphStore.getState().groups[0].color).toBe("#a78bfa");

  // Undo restores the previous (colorless) list, like every other group edit.
  useGraphStore.getState().undo();
  expect(useGraphStore.getState().groups[0].color).toBeUndefined();

  useGraphStore.getState().setGroupColor(id, "#34d399");
  useGraphStore.getState().setGroupColor(id, undefined);
  expect(useGraphStore.getState().groups[0].color).toBeUndefined();
});

test("undo of an add removes the group, redo restores it", () => {
  const id = useGraphStore.getState().addGroup(["n1"], "Cluster")!;
  useGraphStore.getState().undo();
  expect(useGraphStore.getState().groups).toHaveLength(0);

  useGraphStore.getState().redo();
  const groups = useGraphStore.getState().groups;
  expect(groups).toHaveLength(1);
  expect(groups[0].id).toBe(id);
});

test("undo of a collapse both re-opens the frame and reveals the cards", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsed(id);
  expect(useGraphStore.getState().hiddenIds).toEqual(expect.arrayContaining(["n1"]));

  useGraphStore.getState().undo(); // undo the collapse only
  const state = useGraphStore.getState();
  expect(state.groups[0].collapsed).toBeUndefined();
  expect(state.hiddenIds).not.toContain("n1");
  expect(state.hiddenIds).not.toContain("n2");
});

// ── Nesting (W5/W6) ────────────────────────────────────────────────────────
function seedNested() {
  useGraphStore.getState().setGroups([
    { id: "A", title: "A", note: "", memberIds: ["n1"] },
    { id: "B", title: "B", note: "", memberIds: ["n2"], parentId: "A" },
    { id: "C", title: "C", note: "", memberIds: ["n3"], parentId: "B" },
  ]);
}

test("setGroupParent nests a group under another, one undo op", () => {
  useGraphStore.getState().setGroups([
    { id: "A", title: "A", note: "", memberIds: ["n1"] },
    { id: "B", title: "B", note: "", memberIds: ["n2"] },
  ]);
  const before = useGraphStore.getState().past.length;
  useGraphStore.getState().setGroupParent("A", "B");
  const state = useGraphStore.getState();
  expect(state.groups.find((g) => g.id === "A")?.parentId).toBe("B");
  expect(state.past).toHaveLength(before + 1);
  // Undo restores the root placement.
  state.undo();
  expect(useGraphStore.getState().groups.find((g) => g.id === "A")?.parentId).toBeUndefined();
});

test("setGroupParent refuses a cycle (ancestor under descendant) with NO undo entry", () => {
  seedNested(); // A → B → C
  const before = useGraphStore.getState().past.length;
  useGraphStore.getState().setGroupParent("A", "C"); // C is A's descendant — cycle
  const state = useGraphStore.getState();
  expect(state.groups.find((g) => g.id === "A")?.parentId).toBeUndefined(); // unchanged
  expect(state.past).toHaveLength(before); // refused move records nothing
});

test("setGroupParent to root clears parentId", () => {
  seedNested();
  useGraphStore.getState().setGroupParent("B", undefined);
  expect(useGraphStore.getState().groups.find((g) => g.id === "B")?.parentId).toBeUndefined();
});

test("removeGroup orphans children to the grandparent (they survive)", () => {
  seedNested(); // A → B → C
  useGraphStore.getState().removeGroup("B");
  const groups = useGraphStore.getState().groups;
  expect(groups.find((g) => g.id === "B")).toBeUndefined(); // B gone
  expect(groups.find((g) => g.id === "C")?.parentId).toBe("A"); // C re-linked to grandparent
  expect(groups.find((g) => g.id === "A")).toBeDefined(); // A untouched
});

test("removeGroup of a root group makes its children root-level", () => {
  useGraphStore.getState().setGroups([
    { id: "A", title: "A", note: "", memberIds: ["n1"] },
    { id: "B", title: "B", note: "", memberIds: ["n2"], parentId: "A" },
  ]);
  useGraphStore.getState().removeGroup("A");
  expect(useGraphStore.getState().groups.find((g) => g.id === "B")?.parentId).toBeUndefined();
});

test("collapsing a parent hides its WHOLE subtree's cards; expand reveals them", () => {
  seedNested();
  useGraphStore.getState().toggleGroupCollapsed("A"); // A collapses
  let hidden = useGraphStore.getState().hiddenIds;
  expect(hidden).toContain("n1"); // A's own
  expect(hidden).toContain("n2"); // child B's card
  expect(hidden).toContain("n3"); // grandchild C's card
  expect(useGraphStore.getState().groups.find((g) => g.id === "B")?.collapsed).toBeUndefined(); // B not force-collapsed

  useGraphStore.getState().toggleGroupCollapsed("A"); // expand
  hidden = useGraphStore.getState().hiddenIds;
  expect(hidden).not.toContain("n1");
  expect(hidden).not.toContain("n2");
  expect(hidden).not.toContain("n3");
});
