"use client";
import type { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { Group } from "@/lib/fewer/groups";
import { newGroup, normalizeGroupColor, subtreeMemberIds, wouldCreateCycle } from "@/lib/fewer/groups";
import type { ViewState } from "@/lib/fewer/types";
import { captureViewState } from "./historySlice";

export type GroupsSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    /** Canvas groups (T-124): titled, noted boxes of explicitly-listed nodes. */
    groups: Group[];
    /** Replace the whole list with no undo entry — graph load / share view,
     *  where the state being replaced is not part of this history. */
    setGroups: (groups: Group[]) => void;
    /** Group the given nodes under a title; returns the new id, or null when
     *  none of them are on the canvas. */
    addGroup: (memberIds: string[], title: string) => string | null;
    renameGroup: (id: string, title: string) => void;
    setGroupNote: (id: string, note: string) => void;
    /** Frame color: hex to set, or undefined to return to the default. */
    setGroupColor: (id: string, color?: string) => void;
    setGroupMembers: (id: string, memberIds: string[]) => void;
    /** Nesting (W6): move a group under `parentId` (undefined = to root).
     *  No-ops when it would create a cycle. One undo entry. */
    setGroupParent: (id: string, parentId?: string) => void;
    removeGroup: (id: string) => void;
    /** Collapse is per-view state on the leaf, not a flag on the group (T-164):
     *  see `toggleGroupCollapsedForLeaf` in the collapse slice. */
    /** Live-drag write (T-135): move the group's member cards to exact
     *  positions. No history — the header gesture records ONE move-positions
     *  op on release via recordDragMoves. Positions are absolute (from the
     *  gesture's captured start), so a mid-drag re-render cannot drift. */
    setGroupMemberPositions: (id: string, positions: Record<string, { x: number; y: number }>) => void;
  }
>;

/** View state plus the group list: the before/after payload of a `groups` op. */
function snapshot(state: GraphState): ViewState {
  return { ...captureViewState(state), groups: (state.groups ?? []) as Group[] };
}

/**
 * Apply one group mutation and record exactly one undo entry carrying the full
 * before/after view state. Card visibility is no longer part of a group op at
 * all (T-164: collapse is per-view state on the leaf), so the snapshot is the
 * group list alone.
 */
function commit(
  set: (partial: Partial<GraphState>) => void,
  get: () => GraphState,
  next: (state: GraphState) => Partial<GraphState>,
): void {
  const before = snapshot(get());
  set(next(get()));
  get().pushOp({ type: "groups", before, after: snapshot(get()) });
}

function mapGroup(groups: Group[], id: string, fn: (g: Group) => Group): Group[] {
  return groups.map((g) => (g.id === id ? fn(g) : g));
}

/** Drop `parentId` (move to root) without leaving an explicit `undefined`. */
function stripParent(g: Group): Group {
  const { parentId: _parent, ...rest } = g;
  return rest;
}

export const createGroupsSlice: GroupsSliceCreator = (set, get) => ({
  groups: [],

  setGroups: (groups) => set({ groups }),

  addGroup: (memberIds, title) => {
    const present = new Set(((get().nodes ?? []) as { id: string }[]).map((n) => n.id));
    const members = [...new Set(memberIds)].filter((id) => present.has(id));
    if (members.length === 0) return null;
    const group = newGroup(`g-${crypto.randomUUID().slice(0, 8)}`, title, members);
    commit(set, get, (state) => ({ groups: [...((state.groups ?? []) as Group[]), group] }));
    return group.id;
  },

  renameGroup: (id, title) =>
    commit(set, get, (state) => {
      const groups = (state.groups ?? []) as Group[];
      if (!groups.some((g) => g.id === id)) return {};
      return { groups: mapGroup(groups, id, (g) => (g.title === title ? g : { ...g, title })) };
    }),

  setGroupNote: (id, note) =>
    commit(set, get, (state) => {
      const groups = (state.groups ?? []) as Group[];
      if (!groups.some((g) => g.id === id)) return {};
      return { groups: mapGroup(groups, id, (g) => (g.note === note ? g : { ...g, note })) };
    }),

  setGroupMembers: (id, memberIds) =>
    commit(set, get, (state) => {
      const groups = (state.groups ?? []) as Group[];
      if (!groups.some((g) => g.id === id)) return {};
      const members = [...new Set(memberIds)];
      return { groups: mapGroup(groups, id, (g) => (g.memberIds === members ? g : { ...g, memberIds: members })) };
    }),

  setGroupParent: (id, parentId) => {
    const groups = (get().groups ?? []) as Group[];
    const target = groups.find((g) => g.id === id);
    if (!target) return;
    // Undefined/to-root is always safe; otherwise refuse a cycle or a
    // non-existent target (the W6 menu already filters, this is the guard).
    // Guarded BEFORE commit so a refused move records no undo entry.
    if (parentId !== undefined && wouldCreateCycle(groups, id, parentId)) return;
    if (target.parentId === parentId) return;
    commit(set, get, (current) => ({
      groups: mapGroup((current.groups ?? []) as Group[], id, (g) =>
        parentId === undefined ? stripParent(g) : { ...g, parentId },
      ),
    }));
  },

  setGroupColor: (id, color) =>
    commit(set, get, (state) => {
      const groups = (state.groups ?? []) as Group[];
      if (!groups.some((g) => g.id === id)) return {};
      const next = normalizeGroupColor(color);
      return {
        groups: mapGroup(groups, id, (g) => {
          const { color: _previous, ...rest } = g;
          return next ? { ...rest, color: next } : rest;
        }),
      };
    }),

  removeGroup: (id) =>
    commit(set, get, (state) => {
      const groups = (state.groups ?? []) as Group[];
      const target = groups.find((g) => g.id === id);
      if (!target) return {};
      // Orphan (W5): children SURVIVE ungrouping — re-link them to the removed
      // group's own parent (root when it was a root group) instead of deleting.
      return {
        groups: groups
          .filter((g) => g.id !== id)
          .map((g) => (g.parentId === id ? { ...g, parentId: target.parentId } : g)),
      };
    }),

  setGroupMemberPositions: (id, positions) => set((s) => {
    const group = ((s.groups ?? []) as Group[]).find((g) => g.id === id);
    if (!group) return {};
    // Transitive (W5): a group move/scale writes its WHOLE subtree's cards.
    const members = new Set(subtreeMemberIds((s.groups ?? []) as Group[], id));
    let changed = false;
    const nodes = (s.nodes ?? []).map((n) => {
      const pos = members.has(n.id) ? positions[n.id] : undefined;
      if (!pos || (n.position.x === pos.x && n.position.y === pos.y)) return n;
      changed = true;
      return { ...n, position: pos };
    });
    // No graphVersion bump: position writes are what a node drag does mid-gesture
    // too (applyPositionChanges), and rebuilding the lens per frame is the #281
    // loop. Hidden members move as well — their positions are just not painted.
    return changed ? { nodes } : {};
  }),
});
