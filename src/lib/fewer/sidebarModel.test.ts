import { describe, expect, test } from "bun:test";
import {
  visibleSidebarSections,
  hiddenSectionState,
  sectionDraggable,
  newNodeTarget,
  EDGE_STYLE_CHOICES,
} from "./sidebarModel";

describe("visibleSidebarSections", () => {
  const noDock = new Set<string>();

  test("file and appearance always visible when not docked", () => {
    const s = visibleSidebarSections({ dockedIds: noDock, nodeCount: 0, tagCount: 0, advancedModeEnabled: false });
    expect(s.has("file")).toBe(true);
    expect(s.has("appearance")).toBe(true);
  });

  test("tags only visible when nodes present and not docked", () => {
    const noTags = visibleSidebarSections({ dockedIds: noDock, nodeCount: 0, tagCount: 0, advancedModeEnabled: false });
    expect(noTags.has("tags")).toBe(false);
    const hasTags = visibleSidebarSections({ dockedIds: noDock, nodeCount: 5, tagCount: 3, advancedModeEnabled: false });
    expect(hasTags.has("tags")).toBe(true);
  });

  test("analytics only visible in advanced mode with nodes", () => {
    const basic = visibleSidebarSections({ dockedIds: noDock, nodeCount: 5, tagCount: 0, advancedModeEnabled: false });
    expect(basic.has("analytics")).toBe(false);
    const adv = visibleSidebarSections({ dockedIds: noDock, nodeCount: 5, tagCount: 0, advancedModeEnabled: true });
    expect(adv.has("analytics")).toBe(true);
  });

  test("docked sections hidden", () => {
    const docked = visibleSidebarSections({ dockedIds: new Set(["file", "tags"]), nodeCount: 5, tagCount: 3, advancedModeEnabled: true });
    expect(docked.has("file")).toBe(false);
    expect(docked.has("tags")).toBe(false);
    expect(docked.has("appearance")).toBe(true);
  });
});

describe("hiddenSectionState", () => {
  test("no hidden IDs, not active → invisible", () => {
    const s = hiddenSectionState([], undefined, undefined);
    expect(s.visible).toBe(false);
    expect(s.count).toBe(0);
  });

  test("has hidden IDs → visible", () => {
    const s = hiddenSectionState(["n1", "n2"], undefined, undefined);
    expect(s.visible).toBe(true);
    expect(s.count).toBe(2);
  });

  test("activeLeaf provided → uses active hidden IDs", () => {
    const s = hiddenSectionState([], ["a1", "a2"], false);
    expect(s.visible).toBe(true);
    expect(s.count).toBe(2);
  });

  test("activeLeaf with showFiles=false → visible even with 0 hidden", () => {
    const s = hiddenSectionState([], [], false);
    expect(s.visible).toBe(true);
    expect(s.count).toBe(0);
  });

  test("activeLeaf with showFiles=true, no hidden → invisible", () => {
    const s = hiddenSectionState([], [], true);
    expect(s.visible).toBe(false);
    expect(s.count).toBe(0);
  });
});

describe("sectionDraggable", () => {
  test("section not in nonDockableIds and not docked → draggable", () => {
    expect(sectionDraggable("file" as any, new Set(), new Set())).toBe(true);
  });

  test("section in nonDockableIds → not draggable", () => {
    expect(sectionDraggable("file" as any, new Set(), new Set(["file"]))).toBe(false);
  });

  test("section docked → not draggable", () => {
    expect(sectionDraggable("tags" as any, new Set(["tags"]), new Set())).toBe(false);
  });
});

describe("newNodeTarget", () => {
  const nodes = [
    { id: "f1", data: { type: "folder" } },
    { id: "f2", data: { type: "file" } },
  ];

  test("single selected folder → parentId is that folder", () => {
    const r = newNodeTarget(["f1"], nodes, "file");
    expect(r.parentId).toBe("f1");
    expect(r.name).toBe("new-file.txt");
    expect(r.label).toContain("added to folder");
  });

  test("no selection → standalone", () => {
    const r = newNodeTarget([], nodes, "folder");
    expect(r.parentId).toBeNull();
    expect(r.name).toBe("New Folder");
    expect(r.label).toContain("added to canvas");
  });

  test("selected file (not folder) → standalone", () => {
    const r = newNodeTarget(["f2"], nodes, "folder");
    expect(r.parentId).toBeNull();
  });

  test("multiple selected → standalone", () => {
    const r = newNodeTarget(["f1", "f2"], nodes, "file");
    expect(r.parentId).toBeNull();
  });
});

describe("EDGE_STYLE_CHOICES", () => {
  test("contains three options with unique labels", () => {
    expect(EDGE_STYLE_CHOICES).toHaveLength(3);
    const labels = EDGE_STYLE_CHOICES.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
