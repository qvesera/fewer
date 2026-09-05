/**
 * Returns the effective active leaf id (last-clicked view, or primary leaf as
 * fallback). Also provides the resolved ViewSettings for that leaf.
 */
"use client";

import { useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { resolveViewSettings, type ResolvedViewSettings } from "@/lib/fewer/viewState";
import { getPrimary, type PanelNode } from "@/lib/fewer/panelTree";

export interface ActiveLeafResult {
  leafId: string;
  resolved: ResolvedViewSettings;
}

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

  return useMemo(() => {
    const primary = getPrimary(panelTree);
    const id = activeLeafId ?? primary?.area.id;
    if (!id) return null;

    const resolved = resolveViewSettings(viewSettingsMap, id, {
      showFiles: showFilesGlobal,
      minimapHidden: false,
      edgeStyle: edgeStyleGlobal,
      edgeAnimated: edgeAnimatedGlobal,
      edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal,
      edgeStrokeStyle: edgeStrokeStyleGlobal,
      edgeWidth: edgeWidthGlobal,
      direction: directionGlobal,
      hiddenIds,
    }, hiddenIds);

    return { leafId: id, resolved };
  }, [
    activeLeafId, panelTree, viewSettingsMap,
    showFilesGlobal, edgeStyleGlobal, edgeAnimatedGlobal,
    edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyleGlobal,
    edgeWidthGlobal, directionGlobal, hiddenIds,
  ]);
}