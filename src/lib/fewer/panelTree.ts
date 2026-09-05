/**
 * Binary split tree for Blender-style panel areas.
 * DOM-free, unit-testable with bun test.
 *
 * The workspace is a tree of splits (horizontal or vertical) whose leaves are
 * PanelArea nodes. The main graph canvas is a leaf — it can be split into
 * multiple side-by-side viewports of the same data.
 */
import type { PanelArea, AreaEditor } from "./panelLayout";
import { createArea, generateAreaId } from "./panelLayout";

// ── Node types ──

export interface PanelLeaf {
  kind: "leaf";
  area: PanelArea;
  primary?: boolean;
}

export interface PanelSplit {
  kind: "split";
  dir: "h" | "v";
  ratio: number;
  first: PanelNode;
  second: PanelNode;
}

export type PanelNode = PanelLeaf | PanelSplit;

// ── Guards ──

export const isLeaf = (n: PanelNode): n is PanelLeaf => n.kind === "leaf";
export const isSplit = (n: PanelNode): n is PanelSplit => n.kind === "split";

// ── Ratio clamping ──

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
export const clampRatio = (r: number) => Math.max(MIN_RATIO, Math.min(MAX_RATIO, r));

// ── Constructors ──

export function defaultTree(): PanelLeaf {
  return { kind: "leaf", area: createArea("graph"), primary: true };
}

export function makeLeaf(area: PanelArea, primary?: boolean): PanelLeaf {
  return { kind: "leaf", area, primary };
}

export function makeSplit(dir: "h" | "v", first: PanelNode, second: PanelNode, ratio = 0.5): PanelSplit {
  return { kind: "split", dir, ratio: clampRatio(ratio), first, second };
}

// ── Tree queries ──

export function leafList(root: PanelNode): PanelLeaf[] {
  const out: PanelLeaf[] = [];
  (function walk(n: PanelNode) {
    if (isLeaf(n)) { out.push(n); return; }
    walk(n.first); walk(n.second);
  })(root);
  return out;
}

export function findLeaf(root: PanelNode, id: string): PanelLeaf | null {
  if (isLeaf(root)) return root.area.id === id ? root : null;
  return findLeaf(root.first, id) ?? findLeaf(root.second, id);
}

export const leafCount = (root: PanelNode): number =>
  isLeaf(root) ? 1 : leafCount(root.first) + leafCount(root.second);

export const hasLeaf = (root: PanelNode, id: string) => findLeaf(root, id) !== null;

export function getPrimary(root: PanelNode): PanelLeaf | null {
  for (const l of leafList(root)) if (l.primary) return l;
  return null;
}

export function sectionsDockedInTree(root: PanelNode): Set<string> {
  const s = new Set<string>();
  for (const l of leafList(root)) if (l.area.editor !== "graph") s.add(l.area.editor);
  return s;
}

// ── Internal helpers ──

function patchLeaf(root: PanelNode, id: string, patch: (l: PanelLeaf) => PanelLeaf): PanelNode {
  if (isLeaf(root)) return root.area.id === id ? patch(root) : root;
  const f = patchLeaf(root.first, id, patch);
  const s = patchLeaf(root.second, id, patch);
  return f === root.first && s === root.second ? root : { ...root, first: f, second: s };
}

function replaceChild(root: PanelNode, leafId: string, replacement: PanelNode): PanelNode {
  if (isLeaf(root)) return root.area.id === leafId ? replacement : root;
  const f = replaceChild(root.first, leafId, replacement);
  if (f !== root.first) return { ...root, first: f };
  const s = replaceChild(root.second, leafId, replacement);
  if (s !== root.second) return { ...root, second: s };
  return root;
}

// ── Set leaf editor ──

export function setLeafEditor(root: PanelNode, id: string, editor: AreaEditor): PanelNode {
  return patchLeaf(root, id, (l) => ({ ...l, area: { ...l.area, editor } }));
}

// ── Split a leaf ──

/**
 * Split a leaf in two. Existing leaf keeps position; new sibling with same
 * editor type appears beside or above it. `dir` = "h" → side-by-side.
 */
export function splitLeaf(root: PanelNode, targetId: string, dir: "h" | "v", ratio = 0.5): PanelNode {
  const target = findLeaf(root, targetId);
  if (!target) return root;
  const sibling: PanelLeaf = { kind: "leaf", area: createArea(target.area.editor) };
  const splitNode = makeSplit(dir, { ...target }, sibling, ratio);
  if (isLeaf(root) && root.area.id === targetId) return splitNode;
  return replaceChild(root, targetId, splitNode);
}

// ── Join (remove) a leaf ──

/** Replace a specific split node anywhere in the tree with a new subtree. */
function replaceSplitNode(root: PanelNode, split: PanelSplit, replacement: PanelNode): PanelNode {
  if (root === split) return replacement;
  if (isLeaf(root)) return root;
  const f = replaceSplitNode(root.first, split, replacement);
  const s = replaceSplitNode(root.second, split, replacement);
  if (f === root.first && s === root.second) return root;
  return { ...root, first: f, second: s };
}

/**
 * Remove a leaf — its sibling subtree takes over the parent split's space.
 * Cannot remove the last leaf. Cannot remove a primary leaf unless another
 * primary exists elsewhere.
 */
export function joinLeaf(root: PanelNode, targetId: string): PanelNode {
  const target = findLeaf(root, targetId);
  if (!target) return root;
  if (isLeaf(root) && root.area.id === targetId) return root;

  const parent = findParentSplit(root, targetId);
  if (!parent) return root;

  const targetIsFirst = isLeaf(parent.first) && parent.first.area.id === targetId;
  const sibling = targetIsFirst ? parent.second : parent.first;

  if (target.primary) {
    const siblingHasPrimary = isLeaf(sibling) ? !!sibling.primary : getPrimary(sibling) !== null;
    if (!siblingHasPrimary) return root;
  }
  // Replace the parent split with the sibling — collapses the split
  return replaceSplitNode(root, parent, sibling);
}

export function findParentSplit(root: PanelNode, childId: string): PanelSplit | null {
  if (isLeaf(root)) return null;
  if (
    (isLeaf(root.first) && root.first.area.id === childId) ||
    (isLeaf(root.second) && root.second.area.id === childId)
  ) return root;
  return findParentSplit(root.first, childId) ?? findParentSplit(root.second, childId);
}

// ── Insert at screen edge (sidebar drag-to-dock) ──

export function insertLeafAtEdge(root: PanelNode, side: "left" | "right", editor: AreaEditor): PanelNode {
  const newNode = makeLeaf(createArea(editor));
  return side === "left"
    ? makeSplit("h", newNode, root, 0.25)
    : makeSplit("h", root, newNode, 0.75);
}

// ── Adjust split ratio (divider drag) ──

export function setDividerRatio(
  root: PanelNode,
  firstId: string,
  secondId: string,
  ratio: number,
): PanelNode {
  if (isLeaf(root)) return root;
  if (hasLeaf(root.first, firstId) && hasLeaf(root.second, secondId)) {
    return { ...root, ratio: clampRatio(ratio) };
  }
  if (hasLeaf(root.first, secondId) && hasLeaf(root.second, firstId)) {
    return { ...root, ratio: clampRatio(1 - ratio) };
  }
  const f = setDividerRatio(root.first, firstId, secondId, ratio);
  const s = setDividerRatio(root.second, firstId, secondId, ratio);
  return f === root.first && s === root.second ? root : { ...root, first: f, second: s };
}

// ── Serialization ──

export function serializeTree(root: PanelNode): object {
  if (isLeaf(root)) return { kind: "leaf", area: root.area, primary: root.primary };
  return { kind: "split", dir: root.dir, ratio: root.ratio, first: serializeTree(root.first), second: serializeTree(root.second) };
}

const VALID_EDITORS: Set<string> = new Set(["graph", "file", "directories", "layout", "edges", "hidden", "tags", "analytics"]);

function parseNode(v: unknown): PanelNode | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "leaf") {
    const a = o.area as Record<string, unknown> | undefined;
    if (!a || typeof a !== "object") return null;
    if (typeof a.id !== "string" || typeof a.width !== "number" || typeof a.editor !== "string" || !VALID_EDITORS.has(a.editor)) return null;
    return { kind: "leaf", area: { id: a.id, width: a.width, editor: a.editor as AreaEditor }, primary: !!o.primary };
  }
  if (o.kind === "split") {
    const first = parseNode(o.first);
    const second = parseNode(o.second);
    if (!first || !second) return null;
    return { kind: "split", dir: o.dir === "v" ? "v" : "h", ratio: clampRatio(typeof o.ratio === "number" ? o.ratio : 0.5), first, second };
  }
  return null;
}

export const parseTree = (v: unknown): PanelNode | null => {
  const parsed = parseNode(v);
  if (!parsed) return null;
  return dedupeLeafIds(parsed);
};

// ── Deduplicate leaf ids + ensure primary exists ──

export function dedupeLeafIds(root: PanelNode): PanelNode {
  const seen = new Set<string>();
  let hadDupe = false;
  const walk = (n: PanelNode): PanelNode => {
    if (isLeaf(n)) {
      if (seen.has(n.area.id)) {
        hadDupe = true;
        return { ...n, area: { ...n.area, id: generateAreaId() } };
      }
      seen.add(n.area.id);
      return n;
    }
    const f = walk(n.first);
    const s = walk(n.second);
    return f === n.first && s === n.second ? n : { ...n, first: f, second: s };
  };
  let out = walk(root);
  // Ensure a primary leaf exists — promote the first graph leaf if missing
  if (!getPrimary(out)) {
    const graphLeaf = leafList(out).find((l) => l.area.editor === "graph");
    if (graphLeaf) out = patchLeaf(out, graphLeaf.area.id, (l) => ({ ...l, primary: true }));
  }
  return out;
}

// ── v1 migration ──

export function migrateV1ToTree(data: Record<string, unknown>): PanelNode {
  const leftAreas = (Array.isArray(data.leftAreas) ? data.leftAreas : []) as PanelArea[];
  const rightAreas = (Array.isArray(data.rightAreas) ? data.rightAreas : []) as PanelArea[];
  let tree: PanelNode = { kind: "leaf", area: createArea("graph"), primary: true };
  for (const a of leftAreas) tree = makeSplit("h", makeLeaf(a), tree, 0.25);
  for (const a of rightAreas) tree = makeSplit("h", tree, makeLeaf(a), 0.75);
  return tree;
}