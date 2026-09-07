import { describe, expect, it } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { buildBatchActions } from "./batchActions";

const noopToast = () => {};
const base = { toast: noopToast, selectedIds: ["a", "b"], canSetParent: false };

describe("buildBatchActions", () => {
  it("exposes one canonical action list shared by all menus", () => {
    const actions = buildBatchActions(base);
    expect(actions.map((a) => a.id)).toEqual([
      "rename",
      "copy",
      "cut",
      "duplicate",
      "hide",
      "show",
      "collapse",
      "expand",
      "copy-paths",
      "tags",
      "move-to-folder",
      "unparent",
      "delete",
    ]);
  });

  it("marks only destructive actions as danger", () => {
    const actions = buildBatchActions(base);
    expect(actions.filter((a) => a.danger).map((a) => a.id)).toEqual(["delete"]);
  });

  it("labels the delete action with the selection count", () => {
    const del = buildBatchActions({ ...base, selectedIds: ["a", "b", "c"] }).find(
      (a) => a.id === "delete",
    );
    expect(del?.label).toBe("Delete 3 Items");
  });

  it("hides via the leaf layer when an active leaf is set", () => {
    useGraphStore.setState({ activeLeafId: "leaf1", selectedNodeIds: ["a", "b"] });
    const live = useGraphStore.getState();
    let calledWith: string[] = [];
    const orig = live.hideNodesForLeaf;
    (live as unknown as { hideNodesForLeaf: (l: string, ids: string[]) => void }).hideNodesForLeaf = (
      _l,
      ids,
    ) => {
      calledWith = ids;
    };
    const hide = buildBatchActions({ ...base }).find((a) => a.id === "hide");
    hide?.run();
    expect(calledWith).toEqual(["a", "b"]);
    (live as unknown as { hideNodesForLeaf: typeof orig }).hideNodesForLeaf = orig;
  });

  it("collapse and expand only touch folders (global fallback, no active leaf)", () => {
    useGraphStore.setState({ activeLeafId: null });
    const id = useGraphStore.getState().addNode(null, "Folder", "folder");
    useGraphStore.setState({ selectedNodeIds: [id] });
    const collapse = buildBatchActions({ ...base }).find((a) => a.id === "collapse");
    collapse?.run();
    expect(useGraphStore.getState().nodes.find((n) => n.id === id)?.data.collapsed).toBe(true);
    const expand = buildBatchActions({ ...base }).find((a) => a.id === "expand");
    expand?.run();
    expect(useGraphStore.getState().nodes.find((n) => n.id === id)?.data.collapsed).toBe(false);
  });

  it("collapse routes through toggleCollapseForLeaf when a leaf is active", () => {
    useGraphStore.setState({ activeLeafId: "test-leaf", selectedNodeIds: [] });
    const id = useGraphStore.getState().addNode(null, "Folder", "folder");
    useGraphStore.setState({ selectedNodeIds: [id] });
    const collapse = buildBatchActions({ ...base }).find((a) => a.id === "collapse");
    collapse?.run();
    const leafSettings = useGraphStore.getState().viewSettings["test-leaf"];
    expect(leafSettings?.collapsedFolderIds).toContain(id);
    // global flag should NOT be set
    expect(useGraphStore.getState().nodes.find((n) => n.id === id)?.data.collapsed).toBeFalsy();
    const expand = buildBatchActions({ ...base }).find((a) => a.id === "expand");
    expand?.run();
    expect(useGraphStore.getState().viewSettings["test-leaf"]?.collapsedFolderIds).not.toContain(id);
    useGraphStore.setState({ activeLeafId: null });
  });

  it("copy-paths joins selected node paths with newlines", async () => {
    const s = useGraphStore.getState();
    const withPaths = s.nodes.filter((n) => n.data.path).slice(0, 2);
    s.setSelectedNodeIds(withPaths.map((n) => n.id));
    let written = "";
    (globalThis as unknown as { navigator: unknown }).navigator = {
      clipboard: { writeText: (t: string) => { written = t; return Promise.resolve(); } },
    };
    const copy = buildBatchActions({ ...base }).find((a) => a.id === "copy-paths");
    copy?.run();
    expect(written).toBe(withPaths.map((n) => n.data.path).join("\n"));
  });
});
