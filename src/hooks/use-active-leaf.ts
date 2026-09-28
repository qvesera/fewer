/**
 * Returns the effective active leaf id (last-clicked view, or primary leaf as
 * fallback). Also provides the resolved ViewSettings for that leaf.
 */
"use client";

import { useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { resolveViewSettings, type ResolvedViewSettings } from "@/lib/fewer/viewState";
import { getPrimary, type PanelNode } from "@/lib/fewer/panelTree";
import { useStableHiddenIds } from "@/hooks/use-stable-hidden-ids";

export interface ActiveLeafResult {
  leafId: string;
  resolved: ResolvedViewSettings;
}

const NO_IDS: string[] = [];

export function useActiveLeaf(): ActiveLeafResult | null {
  const activeLeafId = useGraphStore((s) => s.activeLeafId);
  const panelTree = useGraphStore((s) => s.panelTree);
  const viewSettingsMap = useGraphStore((s) => s.viewSettings);
  const showFilesGlobal = useGraphStore((s) => s.showFiles);
  const edgeStyleGlobal = useGraphStore((s) => s.edgeStyle);
  const edgeAnimatedGlobal = useGraphStore((s) => s.edgeAnimated);
  const edgeAnimatedSelectedOnlyGlobal = useGraphStore((s) => s.edgeAnimatedSelectedOnly);
  const edgeStrokeStyleGlobal = useGraphStore((s) => s.edgeStrokeStyle);
  const edgeWidthGlobal = useGraphStore((s) => s.edgeWidth);
  const directionGlobal = useGraphStore((s) => s.direction);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const nodes = useGraphStore((s) => s.nodes);

  // Its own memo: this id list feeds the hide-layer union, and a fresh array
  // here would defeat the hidden-set identity the consumers rely on.
  const fileIds = useMemo(
    () => nodes.filter((n) => n.data.type === "file").map((n) => n.id),
    [nodes],
  );
  const leafId = activeLeafId ?? getPrimary(panelTree)?.area.id ?? null;

  const resolved = useMemo(() => {
    if (!leafId) return null;
    return resolveViewSettings(viewSettingsMap, leafId, {
      showFiles: showFilesGlobal,
      minimapHidden: false,
      edgeStyle: edgeStyleGlobal,
      edgeAnimated: edgeAnimatedGlobal,
      edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal,
      edgeStrokeStyle: edgeStrokeStyleGlobal,
      edgeWidth: edgeWidthGlobal,
      direction: directionGlobal,
      hiddenIds,
      collapsedFolderIds: [],
    }, hiddenIds, fileIds);
  }, [
    leafId, viewSettingsMap,
    showFilesGlobal, edgeStyleGlobal, edgeAnimatedGlobal,
    edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyleGlobal, edgeWidthGlobal,
    directionGlobal, hiddenIds, fileIds,
  ]);

  // Content-stable, so consumers (the Hidden Cards panel) don't rebuild their
  // whole hidden tree when an unrelated store write — a drag's per-frame view
  // positions — replaces the resolved object.
  const stableHiddenIds = useStableHiddenIds(resolved?.hiddenIds ?? NO_IDS);

  return useMemo(() => {
    if (!leafId || !resolved) return null;
    if (stableHiddenIds === resolved.hiddenIds) return { leafId, resolved };
    return { leafId, resolved: { ...resolved, hiddenIds: stableHiddenIds } };
  }, [leafId, resolved, stableHiddenIds]);
}