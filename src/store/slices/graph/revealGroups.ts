"use client";
// Reveal ⇄ collapse seam (T-167, tightened by T-169): a reveal gesture that
// wants one of a collapsed group's members on canvas opens that group — in the
// view the gesture runs in, never globally (collapse is per-view state since
// T-164).
//
// Opening a pill must NOT double as "reveal the whole cluster" (T-169): only
// the cards the gesture actually asked for become visible, and the group's
// OTHER members are parked in the leaf's own hide layers — keyed by group id —
// so the Hidden Cards panel still lists them, the eye can bring them back one
// by one, and the pill's chevron (the explicit "open everything" gesture)
// releases the parked set as it expands.
import type { GraphState } from "../types";
import { getPrimary } from "@/lib/fewer/panelTree";
import { groupsIndexOf, groupsOpenedByReveal, subtreeMemberIds } from "@/lib/fewer/groups";
import { computeEffectiveHidden, emptyHideLayers, type HideLayers } from "@/lib/fewer/viewState";

/** What one reveal gesture does to the target view's collapse state. */
export interface GroupRevealPatch {
  leafId: string;
  /** The leaf's collapsed-group list AFTER the gesture (opened groups dropped). */
  collapsedGroupIds: string[];
  /** Per opened group: its members the gesture did NOT reveal, to park under
   *  `hideLayers.subtrees[groupId]` so they stay hidden once the pill opens. */
  park: { groupId: string; ids: string[] }[];
}

/** The view a store-level reveal acts on: the active leaf, else the panel's
 *  primary — the same fallback `useActiveLeaf` resolves with. */
export function revealLeafId(s: GraphState): string | null {
  return s.activeLeafId ?? getPrimary(s.panelTree)?.area.id ?? null;
}

/**
 * The patch a reveal of `revealedIds` applies to the target view, or null when
 * nothing changes (nothing collapsed, nothing intersecting, no view).
 *
 * The park list is the T-169 rule: every member of an OPENED group that the
 * gesture did not reveal — and that no OTHER layer already hides — stays hidden
 * in this leaf, keyed by the group id so the chevron-expand of that group can
 * release exactly what the pill had been standing in for. Callers merge the
 * patch into their own write so one gesture stays one write.
 */
export function openedCollapsedGroupsForLeaf(
  s: GraphState,
  revealedIds: Iterable<string>,
  leafId?: string | null,
): GroupRevealPatch | null {
  const leaf = leafId ?? revealLeafId(s);
  const current = leaf ? s.viewSettings[leaf]?.collapsedGroupIds : undefined;
  if (!leaf || !current?.length) return null;
  const next = groupsOpenedByReveal(s.groups ?? [], current, revealedIds);
  if (!next) return null;

  const openedIds = current.filter((id) => !next.includes(id));
  const targets = revealedIds instanceof Set ? revealedIds : new Set(revealedIds);
  const groups = s.groups ?? [];
  const byId = groupsIndexOf(groups);
  // Cards hidden by a NON-collapse source (global hides, this leaf's layers)
  // are already invisible after the pill opens — nothing to park for them.
  const leafVs = s.viewSettings[leaf];
  const fileIds = s.nodes.filter((n) => n.data.type === "file").map((n) => n.id);
  const hiddenElsewhere = new Set(computeEffectiveHidden(s.hiddenIds, leafVs?.hideLayers, fileIds));
  const park: GroupRevealPatch["park"] = [];
  for (const groupId of openedIds) {
    if (!byId.has(groupId)) continue; // dead id: inert, nothing to park
    const ids = subtreeMemberIds(groups, groupId).filter(
      (m) => !targets.has(m) && !hiddenElsewhere.has(m),
    );
    if (ids.length > 0) park.push({ groupId, ids });
  }
  return { leafId: leaf, collapsedGroupIds: next, park };
}

/** The leaf's hide layers with the patch's parked members merged in, keyed by
 *  group id — for seams that already build the layers object themselves. */
export function parkInLayers(
  layers: HideLayers,
  park: GroupRevealPatch["park"],
): HideLayers {
  let subtrees = layers.subtrees;
  for (const { groupId, ids } of park) {
    const merged = [...new Set([...(subtrees[groupId] ?? []), ...ids])];
    if (merged.length === (subtrees[groupId]?.length ?? 0)) continue;
    if (subtrees === layers.subtrees) subtrees = { ...layers.subtrees };
    subtrees[groupId] = merged;
  }
  return subtrees === layers.subtrees ? layers : { ...layers, subtrees };
}

/** A viewSettings map with one leaf's collapse state replaced by the patch:
 *  the new collapsed list, plus the parked members merged into the leaf's
 *  `subtrees` layer under their group id (the layers object keeps its identity
 *  when the park adds nothing). */
export function withGroupReveal(
  viewSettings: GraphState["viewSettings"],
  patch: GroupRevealPatch,
): GraphState["viewSettings"] {
  const leaf = viewSettings[patch.leafId] ?? {};
  const layers = leaf.hideLayers ?? emptyHideLayers();
  const nextLayers = parkInLayers(layers, patch.park);
  return {
    ...viewSettings,
    [patch.leafId]: {
      ...leaf,
      collapsedGroupIds: patch.collapsedGroupIds,
      ...(nextLayers === layers && leaf.hideLayers !== undefined ? {} : { hideLayers: nextLayers }),
    },
  };
}

/** Release a group's parked set (T-169): the chevron-expand is the explicit
 *  "reveal the whole cluster" gesture, so whatever a partial reveal parked
 *  under this group goes with the pill. */
export function releaseParkedGroup(
  viewSettings: GraphState["viewSettings"],
  leafId: string,
  groupId: string,
): GraphState["viewSettings"] {
  const leaf = viewSettings[leafId];
  if (!leaf?.hideLayers?.subtrees[groupId]) return viewSettings;
  const subtrees = { ...leaf.hideLayers.subtrees };
  delete subtrees[groupId];
  return { ...viewSettings, [leafId]: { ...leaf, hideLayers: { ...leaf.hideLayers, subtrees } } };
}
