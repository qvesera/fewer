"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import { getDescendants } from "@/lib/fewer/validation";
import type { HideLayers } from "@/lib/fewer/viewState";

/** Seed-on-write helper: first call captures the effective global hidden into the leaf's individual layer. */
const seedLayers = (leaf: GraphState["viewSettings"][string] | undefined, globalHidden: string[]): HideLayers =>
  leaf?.hideLayers ?? {
    individual: [...globalHidden],
    subtrees: {},
    filesBulkActive: false,
    filesBulkExempt: [],
  };

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
    const individual = layers.individual.filter((i) => i !== id);
    const sub: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(layers.subtrees)) {
      const filtered = (v as string[]).filter((i) => i !== id);
      if (filtered.length > 0) sub[k] = filtered;
    }
    const filesBulkExempt = layers.filesBulkActive ? [...layers.filesBulkExempt, id] : layers.filesBulkExempt;
    withLeaf(set, get, leafId, { ...leaf, hideLayers: { ...layers, individual, subtrees: sub, filesBulkExempt } });
    get().relayout();
  },

  hideSubtreeForLeaf: (leafId, folderId, descendantIds) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
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
    get().relayout();
  },

  setFilesBulkForLeaf: (leafId, active) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    const layers = leaf.hideLayers ?? { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] };
    withLeaf(set, get, leafId, { ...leaf, hideLayers: { ...layers, filesBulkActive: active, filesBulkExempt: active ? [] : layers.filesBulkExempt } });
    // Relayout when showing files (unhide), not when hiding them
    if (!active) get().relayout();
  },

  revealAllForLeaf: (leafId) => {
    const s = get();
    const leaf = s.viewSettings[leafId] ?? {};
    withLeaf(set, get, leafId, { ...leaf, hideLayers: { individual: [], subtrees: {}, filesBulkActive: false, filesBulkExempt: [] } });
    get().relayout();
  },

  hideNodesForLeaf: (leafId, ids) => get().hideForLeaf(leafId, ids),
});
