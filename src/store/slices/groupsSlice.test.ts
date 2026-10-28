import { test, expect, beforeEach } from "bun:test";
import { useGraphStore } from "@/store/graphStore";
import { resolveViewSettings, type ResolvedViewSettings } from "@/lib/fewer/viewState";

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
    viewSettings: {},
    past: [],
    future: [],
  });
}

const DEFAULTS = {
  showFiles: true, minimapHidden: false, edgeStyle: "bezier", edgeAnimated: false,
  edgeAnimatedSelectedOnly: false, edgeStrokeStyle: "solid", edgeWidth: 2,
  direction: "TB", hiddenIds: [],
} as unknown as ResolvedViewSettings;

/** What THIS leaf actually hides — a collapsed group's members derive in. */
function resolvedHidden(leafId: string): string[] {
  const s = useGraphStore.getState();
  return resolveViewSettings(s.viewSettings, leafId, DEFAULTS, s.hiddenIds, [], s.groups).hiddenIds;
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

test("collapse is PER-VIEW state: the leaf's list flips, nothing is written to hiddenIds (T-164)", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  let state = useGraphStore.getState();
  expect(state.viewSettings["leaf-1"]?.collapsedGroupIds).toEqual([id]);
  expect(state.hiddenIds).toEqual([]); // hidden-ness derives, never stored
  expect(state.groups[0]).not.toHaveProperty("collapsed");
  // ...and the members ARE hidden for that leaf, through the resolver.
  expect(resolvedHidden("leaf-1")).toEqual(expect.arrayContaining(["n1", "n2"]));

  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  state = useGraphStore.getState();
  expect(state.viewSettings["leaf-1"]?.collapsedGroupIds).toEqual([]);
  expect(resolvedHidden("leaf-1")).toEqual([]);
});

test("collapse is per-view: another leaf still paints the members", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  expect(resolvedHidden("leaf-2")).toEqual([]);
});

test("a card the user hid directly stays hidden through collapse + expand", () => {
  useGraphStore.setState({ hiddenIds: ["n2"], independentlyHiddenIds: ["n2"] });
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  expect(resolvedHidden("leaf-1")).toEqual(expect.arrayContaining(["n1", "n2"]));
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  expect(resolvedHidden("leaf-1")).toEqual(["n2"]); // n1 back; n2's own hide wins
});

test("collapse records no undo entry (view-only, like folder collapse)", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  const before = useGraphStore.getState().past.length;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  expect(useGraphStore.getState().past).toHaveLength(before);
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

// Collapse is per-view state (T-164): there is no undo for it, exactly like
// folder collapse — the toggle writes viewSettings and records no history op.

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

test("a collapsed parent hides its WHOLE subtree in that view; expand re-shows them", () => {
  seedNested();
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "A");
  expect(resolvedHidden("leaf-1")).toEqual(expect.arrayContaining(["n1", "n2", "n3"]));
  // B is not force-collapsed: a nested collapse is its own per-view entry.
  expect(useGraphStore.getState().viewSettings["leaf-1"]?.collapsedGroupIds).toEqual(["A"]);

  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "A");
  expect(resolvedHidden("leaf-1")).toEqual([]);
});

test("a collapsed CHILD stays collapsed when its parent expands (each entry hides its own subtree)", () => {
  seedNested();
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "A");
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "B");
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "A"); // expand parent only
  const hidden = resolvedHidden("leaf-1");
  expect(hidden).not.toContain("n1"); // A's own card is back
  expect(hidden).toEqual(expect.arrayContaining(["n2", "n3"])); // B's subtree still hidden
});

// ── Reveal opens the group (T-167) ─────────────────────────────────────────

/** This leaf's collapsed-group list (defaults to empty). */
function collapsedIds(leafId: string): string[] {
  return useGraphStore.getState().viewSettings[leafId]?.collapsedGroupIds ?? [];
}

test("Reveal All after collapse expands the group — the reported bug (T-167)", () => {
  useGraphStore.setState({ activeLeafId: "leaf-1" });
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().showAll(); // the Hidden panel button / ⇧H
  expect(collapsedIds("leaf-1")).toEqual([]);
  expect(resolvedHidden("leaf-1")).toEqual([]);
});

test("showNode on a card hidden ONLY by the collapse opens the group instead of no-opping", () => {
  useGraphStore.setState({ activeLeafId: "leaf-1" });
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().showNode("n2"); // in no hide set — the group is the hiding
  expect(collapsedIds("leaf-1")).toEqual([]);
  // T-169: only the asked-for card comes back; the sibling is PARKED (still in
  // the panel, eye-revealable), not revealed along with it.
  expect(resolvedHidden("leaf-1")).toEqual(["n1"]);
});

test("the Hidden panel eye (revealInView) on a collapsed member opens the group", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().revealInView("leaf-1", "n1");
  expect(collapsedIds("leaf-1")).toEqual([]);
  expect(resolvedHidden("leaf-1")).toEqual(["n2"]); // the sibling stays hidden (T-169)
});

test("eyeRevealForLeaf opens the group when the card hides only by collapse", () => {
  const id = useGraphStore.getState().addGroup(["n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().eyeRevealForLeaf("leaf-1", "n2");
  expect(collapsedIds("leaf-1")).toEqual([]);
});

test("Show Children opens the group when a descendant is a member", () => {
  useGraphStore.setState({
    edges: [{ id: "e1", source: "n1", target: "n2" }] as never,
    activeLeafId: "leaf-1",
  });
  const id = useGraphStore.getState().addGroup(["n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().showSubtreeForLeaf("leaf-1", "n1");
  expect(collapsedIds("leaf-1")).toEqual([]);
});

test("Reveal All opens only the TARGET view's groups — another pane keeps its collapse", () => {
  useGraphStore.setState({ activeLeafId: "leaf-1" });
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-2", id);
  useGraphStore.getState().showAll();
  expect(collapsedIds("leaf-1")).toEqual([]); // the reveal ran here
  expect(collapsedIds("leaf-2")).toEqual([id]); // the other pane is untouched
});

test("undo of the reveal does not re-collapse the group (collapse is view-only)", () => {
  useGraphStore.setState({ activeLeafId: "leaf-1" });
  const id = useGraphStore.getState().addGroup(["n1", "n2"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().showNode("n2");
  expect(collapsedIds("leaf-1")).toEqual([]);
  useGraphStore.getState().undo(); // undoes the reveal op, not the view state
  expect(collapsedIds("leaf-1")).toEqual([]); // the frame stays a frame
});

// ── Single reveal parks the siblings (T-169) ────────────────────────────────

test("a single-card reveal parks the SIBLINGS: only the asked-for card comes back (T-169)", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2", "n3"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().revealInView("leaf-1", "n1");
  expect(collapsedIds("leaf-1")).toEqual([]); // the frame is back
  expect(resolvedHidden("leaf-1")).toEqual(["n2", "n3"]); // siblings stay hidden
  // The parked set lives in the leaf's layers keyed by group, so the eye takes
  // them one by one — and each of those is its own scoped reveal.
  useGraphStore.getState().eyeRevealForLeaf("leaf-1", "n2");
  expect(resolvedHidden("leaf-1")).toEqual(["n3"]);
});

test("the chevron expand is the 'reveal the whole cluster' gesture: it releases the parked set (T-169)", () => {
  const id = useGraphStore.getState().addGroup(["n1", "n2", "n3"], "Cluster")!;
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id);
  useGraphStore.getState().showNode("n2"); // single reveal: opens, parks n1+n3
  expect(resolvedHidden("leaf-1")).toEqual(["n1", "n3"]);
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id); // collapse again
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", id); // chevron expand
  expect(resolvedHidden("leaf-1")).toEqual([]); // the whole cluster is back
});

test("a single reveal in a nested group parks every opened group's other members (T-169)", () => {
  seedNested(); // A[n1] → B[n2] → C[n3]
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "A");
  useGraphStore.getState().toggleGroupCollapsedForLeaf("leaf-1", "B");
  useGraphStore.getState().revealInView("leaf-1", "n2"); // a card of B
  expect(collapsedIds("leaf-1")).toEqual([]); // both pills became frames
  expect(resolvedHidden("leaf-1")).toEqual(["n1", "n3"]); // A's own + C's card parked
});
