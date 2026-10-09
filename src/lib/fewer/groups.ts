/**
 * Canvas groups (T-124) — the model half.
 *
 * A group is a titled, noted box of explicitly-listed node ids, drawn as a
 * gray frame behind the member cards (T-125 renders it). Membership is an
 * explicit id list, never "whatever happens to sit inside the box": layout
 * moves cards on every re-flow, so geometric membership would silently rewrite
 * itself — and an explicit list survives undo, refresh, and relayout.
 *
 * Pure module: no store, no React, no DOM. Node/edge/position lookups all take
 * `nodes` as an argument, so the rules are testable without a graph store.
 */
import type { FewerNode } from "./types";

/** One group: a title, a note, and the node ids it owns. */
export interface Group {
  /** Stable id (`g-…`), independent of node ids. */
  id: string;
  /** Short title shown on the frame header. */
  title: string;
  /** Free-text note shown on hover over the title (T-125). */
  note: string;
  /** Explicit membership, in the order it was built. */
  memberIds: string[];
  /** Collapsed groups hide their members and shrink to a title pill. */
  collapsed?: boolean;
}

/** Gap between the member bounding box and the frame edge. */
export const GROUP_PADDING = 24;

/** Header height the frame reserves so the title never overlaps a card. */
export const GROUP_HEADER_HEIGHT = 32;

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of a group's members, padded, or `null` when none of them are
 * on the canvas (an all-hidden or all-deleted group has nothing to frame).
 * Hidden members still count: a collapsed group keeps its bounds so the pill
 * sits where the cluster was.
 */
export function groupBounds(
  nodes: FewerNode[],
  memberIds: readonly string[],
  padding = GROUP_PADDING,
): GroupBounds | null {
  const members = new Set(memberIds);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = 0;

  for (const node of nodes) {
    if (!members.has(node.id)) continue;
    const w = (node.style?.width as number | undefined) ?? node.width ?? 0;
    const h = (node.style?.height as number | undefined) ?? node.height ?? 0;
    const { x, y } = node.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
    found++;
  }

  if (found === 0) return null;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/** Construct a group. Id comes from the caller so this stays pure. */
export function newGroup(id: string, title: string, memberIds: readonly string[]): Group {
  return {
    id,
    title: title.trim() || "Untitled group",
    note: "",
    memberIds: dedupe(memberIds),
  };
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Repair a loaded group list: drop dangling member ids (nodes deleted since
 * the save), de-duplicate, drop groups left with no members, and clamp the
 * title. Runs on load so a hand-edited `.fwr` cannot put the frame renderer in
 * a state it was never designed for.
 */
export function normalizeGroups(groups: readonly Group[] | undefined, nodeIds: ReadonlySet<string>): Group[] {
  if (!Array.isArray(groups)) return [];
  const out: Group[] = [];
  for (const g of groups) {
    if (!g || typeof g.id !== "string" || !g.id) continue;
    const memberIds = dedupe(g.memberIds ?? []).filter((id) => nodeIds.has(id));
    if (memberIds.length === 0) continue;
    out.push({
      id: g.id,
      title: (typeof g.title === "string" ? g.title : "").slice(0, 80) || "Untitled group",
      note: typeof g.note === "string" ? g.note : "",
      memberIds,
      ...(g.collapsed ? { collapsed: true } : {}),
    });
  }
  return out;
}

/** id → group. */
export function groupsIndexOf(groups: readonly Group[]): Map<string, Group> {
  return new Map(groups.map((g) => [g.id, g]));
}

/**
 * node id → the group owning it. A node belongs to at most one group — the
 * first group listing it wins, and `normalizeGroups` never reorders, so the
 * winner is deterministic on load.
 */
export function membershipMap(groups: readonly Group[]): Map<string, string> {
  const owner = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.memberIds) {
      if (!owner.has(id)) owner.set(id, g.id);
    }
  }
  return owner;
}