import { describe, it, expect } from "bun:test";
import { createArea } from "./panelLayout";
import {
  defaultTree,
  makeLeaf,
  leafList,
  findLeaf,
  leafCount,
  getPrimary,
  sectionsDockedInTree,
  splitLeaf,
  joinLeaf,
  setLeafEditor,
  insertLeafAtEdge,
  setDividerRatio,
  serializeTree,
  parseTree,
  migrateV1ToTree,
  isLeaf,
} from "./panelTree";

function leafId(node: ReturnType<typeof defaultTree>) {
  if (isLeaf(node)) return node.area.id;
  throw new Error("expected leaf");
}

describe("panelTree", () => {
  describe("defaultTree", () => {
    it("creates a single primary graph leaf", () => {
      const t = defaultTree();
      expect(isLeaf(t)).toBe(true);
      if (isLeaf(t)) {
        expect(t.area.editor).toBe("graph");
        expect(t.primary).toBe(true);
      }
    });
  });

  describe("leafList / leafCount / findLeaf", () => {
    it("single leaf", () => {
      const t = defaultTree();
      expect(leafList(t)).toHaveLength(1);
      expect(leafCount(t)).toBe(1);
    });
    it("after split", () => {
      const root = defaultTree();
      const id = leafId(root);
      const t = splitLeaf(root, id, "h");
      expect(leafCount(t)).toBe(2);
      expect(leafList(t)).toHaveLength(2);
      expect(findLeaf(t, id)).not.toBeNull();
    });
  });

  describe("splitLeaf", () => {
    it("doubles leaf count", () => {
      const root = defaultTree();
      const id = leafId(root);
      const result = splitLeaf(root, id, "h");
      expect(leafCount(result)).toBe(2);
    });
    it("original leaf keeps its id", () => {
      const root = defaultTree();
      const id = leafId(root);
      const result = splitLeaf(root, id, "v");
      expect(findLeaf(result, id)).not.toBeNull();
    });
    it("new sibling gets same editor type", () => {
      const root = makeLeaf(createArea("layout"));
      const id = leafId(root);
      const result = splitLeaf(root, id, "h");
      const leaves = leafList(result);
      expect(leaves.length).toBe(2);
      expect(leaves[0].area.editor).toBe("layout");
      expect(leaves[1].area.editor).toBe("layout");
    });
    it("no-op for missing id", () => {
      const root = defaultTree();
      const result = splitLeaf(root, "nonexistent", "h");
      expect(result).toBe(root);
    });
  });

  describe("joinLeaf", () => {
    it("removes a leaf, sibling takes over", () => {
      const root = splitLeaf(defaultTree(), leafId(defaultTree()), "h");
      const leaves = leafList(root);
      const targetId = leaves[0].area.id;
      const result = joinLeaf(root, targetId);
      expect(leafCount(result)).toBe(1);
    });
    it("no-op on single leaf", () => {
      const root = defaultTree();
      const result = joinLeaf(root, leafId(root));
      expect(result).toBe(root);
    });
    it("protects primary leaf", () => {
      const root = splitLeaf(defaultTree(), leafId(defaultTree()), "h");
      const primary = getPrimary(root)!;
      const result = joinLeaf(root, primary.area.id);
      expect(result).toBe(root);
    });
  });

  describe("setLeafEditor", () => {
    it("updates editor type", () => {
      const root = defaultTree();
      const id = leafId(root);
      const result = setLeafEditor(root, id, "layout");
      expect(findLeaf(result, id)?.area.editor).toBe("layout");
    });
  });

  describe("insertLeafAtEdge", () => {
    it("inserts on left", () => {
      const root = defaultTree();
      const result = insertLeafAtEdge(root, "left", "tags");
      expect(leafCount(result)).toBe(2);
      expect(leafList(result)[0].area.editor).toBe("tags");
    });
    it("inserts on right", () => {
      const root = defaultTree();
      const result = insertLeafAtEdge(root, "right", "tags");
      expect(leafCount(result)).toBe(2);
      expect(leafList(result)[1].area.editor).toBe("tags");
    });
  });

  describe("sectionsDockedInTree", () => {
    it("returns empty for graph-only tree", () => {
      expect(sectionsDockedInTree(defaultTree()).size).toBe(0);
    });
    it("finds section editors", () => {
      const root = insertLeafAtEdge(defaultTree(), "left", "layout");
      expect(sectionsDockedInTree(root).has("layout")).toBe(true);
    });
  });

  describe("serializeTree / parseTree round-trip", () => {
    it("round-trips single leaf", () => {
      expect(parseTree(serializeTree(defaultTree()))).not.toBeNull();
    });
    it("round-trips split tree", () => {
      const root = defaultTree();
      const t = splitLeaf(root, leafId(root), "h");
      const parsed = parseTree(serializeTree(t));
      expect(parsed).not.toBeNull();
      expect(leafCount(parsed!)).toBe(2);
    });
    it("rejects invalid editor", () => {
      expect(parseTree({ kind: "leaf", area: { id: "x", width: 200, editor: "bogus" } })).toBeNull();
    });
    it("null returns null", () => {
      expect(parseTree(null)).toBeNull();
    });
  });

  describe("migrateV1ToTree", () => {
    it("empty v1 -> single graph leaf", () => {
      expect(leafCount(migrateV1ToTree({ leftAreas: [], rightAreas: [] }))).toBe(1);
    });
    it("preserves left area count", () => {
      const tree = migrateV1ToTree({ leftAreas: [createArea("layout")], rightAreas: [] });
      expect(leafCount(tree)).toBe(2);
    });
  });
});
