"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { getDescendants } from "@/lib/fewer/validation";
import { emptyHideLayers, type HideLayers } from "@/lib/fewer/viewState";
import { captureViewState, viewStateOp } from "../historySlice";
import { planReveal } from "../graph/reveal";

/** Seed-on-write helper: first call captures the effective global hidden into the leaf's individual layer. */
const seedLayers = (leaf: GraphState["viewSettings"][string] | undefined, globalHidden: string[]): HideLayers =>
  leaf?.hideLayers ?? { ...emptyHideLayers(), individual: [...globalHidden] };

/** Write one leaf's settings back, bump graphVersion (per-leaf canvas sync). */
const withLeaf = (set: Parameters<FolderSliceCreator>[0], get: () => GraphState, leafId: string, nextLeaf: unknown) => {
  const s = get();
  set({ viewSettings: { ...s.viewSettings, [leafId]: nextLeaf }, graphVersion: s.graphVersion + 1 });
  get()._persistLayout();
};

/** Ids of the given nodes that are files. */
function fileIdSet(s: GraphState, ids: string[]): string[] {
  const byId = new Map<string, GraphState["nodes"][number]>(s.nodes.map((n) => [n.id, n]));
  return ids.filter((id) => byId.get(id)?.data.type === "file");
}

/**
 * A view's layers with `id` released from every layer that can hide it:
 * individual, every folder's subtree, and the bulk "Hide Files" exemption.
 * Pure — the caller decides whether that is one write or three.
 */
export function releaseIdFromLayers(layers: HideLayers, id: string): HideLayers {
  const sub: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(layers.subtrees)) {
    const filtered = (v as string[]).filter((i) => i !== id);
    if (filtered.length > 0) sub[k] = filtered;
  }
  return {
    ...layers,
    individual: layers.individual.filter((i) => i !== id),
    subtrees: sub,
    filesBulkExempt:
      layers.filesBulkActive && !layers.filesBulkExempt.includes(id)
        ? [...layers.filesBulkExempt, id]
        : layers.filesBulkExempt,
  };
}

/**
 * Did releasing an id change the layers? A release only ever removes entries,
 * so per-layer length deltas are exact here — and a click that changes nothing
 * must stay a no-op (no version bump, no layout, no persist).
 */
function sameHideLayers(a: HideLayers, b: HideLayers): boolean {
  if (a.individual.length !== b.individual.length) return false;
  if (a.filesBulkActive !== b.filesBulkActive) return false;
  if (a.filesBulkExempt.length !== b.filesBulkExempt.length) return false;
  const keys = Object.keys(a.subtrees);
  if (keys.length !== Object.keys(b.subtrees).length) return false;
  return keys.every((k) => (a.subtrees[k]?.length ?? 0) === (b.subtrees[k]?.length ?? 0));
}

export type FolderSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    /** Seed-on-write: first call captures effective hidden, then adds to individual layer. */
    hideForLeaf: (leafId: string, ids: string[]) => void;
    /** Eye-reveal: removes id from individual + subtrees + adds to filesBulkExempt. */
    eyeRevealForLeaf: (leafId: string, id: string) => void;
    /** Per-folder Hide Children. */
    hideSubtreeForLeaf: (leafId: string, folderId: string, descendantIds: string[]) => void;
    /** Per-folder Show Children. */
    showSubtreeForLeaf: (leafId: string, folderId: string) => void;
    /** Toggle "Hide Files" bulk layer. */
    setFilesBulkForLeaf: (leafId: string, active: boolean) => void;
    /**
     * ONE reveal gesture — the sidebar's eye, the canvas' hidden child row, the
     * SearchPanel jump. Moves the view's layers, the global hide sets and the
     * auto-hide exemption list in a single store write: one graphVersion bump,
     * one layout pass, one undo step. It deliberately does NOT re-run the
     * auto-hide reconcile — that pass re-hides every non-exempt child of an
     * over-threshold folder, so a reconcile here undid the user's canvas
     * double-click reveals while keeping the sidebar's own history.
     */
    revealInView: (leafId: string | null, id: string, opts?: { subtree?: boolean }) => void;
    /** Clear all hide layers for this view (Reveal All). */
    revealAllForLeaf: (leafId: string) => void;
    /** Alias for hideForLeaf used by keyboard hide routing. */
    hideNodesForLeaf: (leafId: string, ids: string[]) => void;
  }
>;

export const createFolderSlice: FolderSliceCreator = (set, get) => ({
  hideForLeaf: (leafId, ids) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = seedLayers(leaf, s.hiddenIds);
    // Expand descendants (like the global hideNodes did): the folder goes into
    // `individual`, its descendants into `subtrees[folderId]` so per-folder
    // Show Children can reveal them without touching the folder itself.
    const individual = new Set(layers.individual);
    const subtrees = { ...layers.subtrees };
    for (const id of ids) {
      individual.add(id);
      // ponytail: descendants via shared validation helper, no hand-rolled BFS.
      const descendants = getDescendants(id, s.edges);
      if (descendants.length > 0) {
        subtrees[id] = [...new Set([...(subtrees[id] ?? []), ...descendants])];
      }
    }
    withLeaf(set, get, leafId, { ...leaf, hideLayers: { ...layers, individual: [...individual], subtrees } });
  },

  eyeRevealForLeaf: (leafId, id) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers;
    if (!layers) return;
    // Register the exemption too: a card hidden only in this view's layers is
    // invisible to showNode, so without this a later auto-hide reconcile (folder
    // refresh, threshold change) could re-hide it.
    set({ revealedRootIds: [...new Set([...s.revealedRootIds, id])] });
    withLeaf(set, get, leafId, { ...leaf, hideLayers: releaseIdFromLayers(layers, id) });
    get().relayoutIfAuto();
  },

  revealInView: (leafId, id, opts) => {
    const s = get();
    const toShow = planReveal({
      edges: s.edges,
      hiddenIds: s.hiddenIds,
      independentlyHiddenIds: s.independentlyHiddenIds,
      id,
      subtree: opts?.subtree ?? false,
    });

    // The view's own layers, computed but not written yet.
    const leaf = leafId ? s.viewSettings[leafId] : undefined;
    const nextLayers = leaf?.hideLayers ? releaseIdFromLayers(leaf.hideLayers, id) : null;
    const layerChanged =
      nextLayers !== null &&
      leaf !== undefined &&
      !sameHideLayers(leaf.hideLayers!, nextLayers);
    if (toShow.size === 0 && !layerChanged) return; // nothing was hiding it

    const before = captureViewState(s);
    const after = {
      ...before,
      hiddenIds: before.hiddenIds.filter((h) => !toShow.has(h)),
      independentlyHiddenIds: before.independentlyHiddenIds.filter((h) => !toShow.has(h)),
      autoHiddenIds: before.autoHiddenIds.filter((h) => !toShow.has(h)),
    };
    get().pushOp(viewStateOp(before, after));

    // Two ledgers, one gesture: revealedRootIds is the exemption the auto-hide
    // reconciler honours (a revealed card stays visible until the user hides it
    // again), revealedFromHidden is the depth slider's "already revealed" memory.
    const revealed = [...toShow];
    set({
      hiddenIds: after.hiddenIds,
      independentlyHiddenIds: after.independentlyHiddenIds,
      autoHiddenIds: after.autoHiddenIds,
      revealedRootIds: [...new Set([...s.revealedRootIds, ...revealed])],
      revealedFromHidden: [...new Set([...s.revealedFromHidden, ...revealed])],
      ...(layerChanged && leafId
        ? { viewSettings: { ...s.viewSettings, [leafId]: { ...leaf, hideLayers: nextLayers! } } }
        : {}),
      graphVersion: s.graphVersion + 1,
    });
    if (layerChanged) get()._persistLayout();
    get().relayoutIfAuto();
  },

  hideSubtreeForLeaf: (leafId, folderId, descendantIds) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? emptyHideLayers();
    // Merge (don't overwrite): re-hiding a folder must not re-hide children the
    // user individually revealed since the last hide. Individually-hidden descendants
    // are already filtered out by the caller (only visible descendants are passed).
    const merged = [...new Set([...(layers.subtrees[folderId] ?? []), ...descendantIds])];
    withLeaf(set, get, leafId, { ...leaf, hideLayers: { ...layers, subtrees: { ...layers.subtrees, [folderId]: merged } } });
  },

  showSubtreeForLeaf: (leafId, folderId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers;
    const descendants = getDescendants(folderId, s.edges);
    if (layers) {
      const subtrees = { ...layers.subtrees };
      delete subtrees[folderId];
      // Show Children must win over the bulk "Hide Files" layer too: exempt this
      // folder's descendant files (same mechanism the eye-reveal uses), so the
      // children actually appear while the bulk layer stays on for everywhere else.
      const filesBulkExempt = layers.filesBulkActive
        ? [...new Set([...layers.filesBulkExempt, ...fileIdSet(s, descendants)])]
        : layers.filesBulkExempt;
      withLeaf(set, get, leafId, { ...leaf, hideLayers: { ...layers, subtrees, filesBulkExempt } });
    }
    // Files may also be hidden GLOBALLY (no leaf, or a leaf seeded from a global
    // "Show Files" off state) — the folder's hidden descendants live in hiddenIds,
    // so reveal them there too. collectShowSubtrees stops at independently-hidden
    // nodes, matching showSubtree: per-node user hides stay hidden.
    const indieSet = new Set(get().independentlyHiddenIds);
    const globalHidden = new Set(get().hiddenIds);
    const hiddenDesc = descendants.filter((d) => globalHidden.has(d) && !indieSet.has(d));
    if (hiddenDesc.length > 0) get().showSubtrees(hiddenDesc);
    get().relayoutIfAuto();
  },

  setFilesBulkForLeaf: (leafId, active) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? emptyHideLayers();
    withLeaf(set, get, leafId, { ...leaf, hideLayers: { ...layers, filesBulkActive: active, filesBulkExempt: active ? [] : layers.filesBulkExempt } });
    // Relayout when showing files (unhide), not when hiding them
    if (!active) get().relayoutIfAuto();
  },

  revealAllForLeaf: (leafId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    withLeaf(set, get, leafId, { ...leaf, hideLayers: emptyHideLayers() });
    get().relayoutIfAuto();
  },

  hideNodesForLeaf: (leafId, ids) => get().hideForLeaf(leafId, ids),
});
