"use client";
// Reveal ⇄ collapse seam (T-167): a reveal gesture that wants one of a
// collapsed group's members on canvas opens that group — in the view the
// gesture runs in, never globally (collapse is per-view state since T-164).
//
// This is the invariant repair behind "collapse a group, reveal its cards, and
// the group is expanded immediately": before, no reveal path ever cleared the
// pill state, so a pill could sit over live cards — or, worse, silently refuse
// to reveal anything, because the members are hidden by derivation and appear
// in no hide set a reveal can edit.
import type { GraphState } from "../types";
import { getPrimary } from "@/lib/fewer/panelTree";
import { groupsOpenedByReveal } from "@/lib/fewer/groups";

/** The view a store-level reveal acts on: the active leaf, else the panel's
 *  primary — the same fallback `useActiveLeaf` resolves with. */
export function revealLeafId(s: GraphState): string | null {
  return s.activeLeafId ?? getPrimary(s.panelTree)?.area.id ?? null;
}

/** The leaf's collapsed-group list AFTER a reveal of `revealedIds`, or null
 *  when nothing changes (nothing collapsed, nothing intersecting, no view).
 *  Callers merge it into their own write so one gesture stays one write. */
export function openedCollapsedGroupsForLeaf(
  s: GraphState,
  revealedIds: Iterable<string>,
  leafId?: string | null,
): { leafId: string; collapsedGroupIds: string[] } | null {
  const leaf = leafId ?? revealLeafId(s);
  const current = leaf ? s.viewSettings[leaf]?.collapsedGroupIds : undefined;
  if (!leaf || !current?.length) return null;
  const next = groupsOpenedByReveal(s.groups ?? [], current, revealedIds);
  if (!next) return null;
  return { leafId: leaf, collapsedGroupIds: next };
}

/** A viewSettings map with one leaf's collapsed-group list replaced — the
 *  spread shape every seam's `set` already uses. */
export function withCollapsedGroupIds(
  viewSettings: GraphState["viewSettings"],
  leafId: string,
  collapsedGroupIds: string[],
): GraphState["viewSettings"] {
  const leaf = viewSettings[leafId] ?? {};
  return { ...viewSettings, [leafId]: { ...leaf, collapsedGroupIds } };
}
