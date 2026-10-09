"use client";
import type { StateCreator } from "zustand";
import type { GraphState } from "./types";
import type { Group } from "@/lib/fewer/groups";
import { newGroup, normalizeGroupColor } from "@/lib/fewer/groups";
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
    removeGroup: (id: string) => void;
    /** Collapse hides the members; expand reveals them again, except any the
     *  user hid directly (independentlyHiddenIds) — same rule showSubtree uses. */
    toggleGroupCollapsed: (id: string) => void;
  }
>;

/** View state plus the group list: the before/after payload of a `groups` op. */
function snapshot(state: GraphState): ViewState {
  return { ...captureViewState(state), groups: (state.groups ?? []) as Group[] };
}

/**
 * Apply one group mutation and record exactly one undo entry carrying the full
 * before/after view state. Collapsing also rewrites `hiddenIds`, which the same
 * snapshot restores, so undo of a collapse both reopens the frame and reveals
 * the cards — no second op, no ordering hazard.
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
      if (!groups.some((g) => g.id === id)) return {};
      return { groups: groups.filter((g) => g.id !== id) };
    }),

  toggleGroupCollapsed: (id) => {
    const state = get();
    const group = ((state.groups ?? []) as Group[]).find((g) => g.id === id);
    if (!group) return;
    const collapsing = !group.collapsed;
    commit(set, get, (current) => {
      const groups = mapGroup((current.groups ?? []) as Group[], id, (g) => {
        const { collapsed: _expanded, ...rest } = g;
        return collapsing ? { ...rest, collapsed: true } : rest;
      });
      const hidden = new Set((current.hiddenIds ?? []) as string[]);
      const keep = new Set((current.independentlyHiddenIds ?? []) as string[]);
      if (collapsing) {
        for (const m of group.memberIds) hidden.add(m);
      } else {
        for (const m of group.memberIds) if (!keep.has(m)) hidden.delete(m);
      }
      return { groups, hiddenIds: [...hidden] };
    });
  },
});
