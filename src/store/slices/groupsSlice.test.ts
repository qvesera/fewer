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
