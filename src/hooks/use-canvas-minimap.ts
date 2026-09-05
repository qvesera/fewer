import { useMemo, useCallback } from "react";
import type { CSSProperties } from "react";
import type { PanelPosition } from "@xyflow/react";
import { useGraphStore } from "@/store/graphStore";
import type { FewerNode } from "@/lib/fewer/types";
import type { CanvasThemeColors } from "./use-canvas-theme-colors";

interface UseCanvasMinimapDeps {
  themeColors: CanvasThemeColors;
  isDark: boolean;
  leafId?: string;
}

interface UseCanvasMinimapResult {
  showMiniMap: boolean;
  scrollAction: "pan" | "zoom";
  minimapStyle: CSSProperties;
  rfMiniMapPosition: PanelPosition;
  nodeColor: (n: FewerNode) => string;
  nodeStrokeColor: (n: FewerNode) => string;
}

/**
 * Minimap state + styling. Collapses store selectors into one logical unit.
 * When leafId is provided, minimap visibility is per-view (toggled via context menu).
 */
export function useCanvasMinimap({ themeColors, isDark, leafId }: UseCanvasMinimapDeps): UseCanvasMinimapResult {
  const showMiniMapGlobal = useGraphStore((s) => s.showMiniMap);
  const minimapHidden = useGraphStore((s) => s.minimapHidden);
  const showMiniMap = leafId ? showMiniMapGlobal && !minimapHidden.has(leafId) : showMiniMapGlobal;
  const scrollAction = useGraphStore((s) => s.scrollAction) as "pan" | "zoom";
  const miniMapPosition = useGraphStore((s) => s.miniMapPosition);
  const miniMapSize = useGraphStore((s) => s.miniMapSize);
  const miniMapX = useGraphStore((s) => s.miniMapX);
  const miniMapY = useGraphStore((s) => s.miniMapY);

  const minimapStyle = useMemo<CSSProperties>(() => {
    const base: CSSProperties = {
      width: miniMapSize, height: miniMapSize,
      // Frosted glass like .gm-float: flat 60% alpha lets canvas nodes bleed
      // through; 80% background + blur keeps the minimap legible.
      background: "color-mix(in srgb, var(--background) 80%, transparent)",
      backdropFilter: "blur(24px) saturate(200%)",
      WebkitBackdropFilter: "blur(24px) saturate(200%)",
      borderRadius: "12px",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.1)"}`,
    };
    // Custom position: pin the minimap to a free-form x/y. Anchor to the
    // top-left corner and override with explicit offsets + zero margin so the
    // slider-chosen coordinates lock in place (the inline style beats the
    // React Flow panel corner classes).
    if (miniMapPosition === "custom") {
      return { ...base, position: "absolute", top: miniMapY, left: miniMapX, margin: 0 };
    }
    return base;
  }, [isDark, miniMapSize, miniMapPosition, miniMapX, miniMapY]);

  // "custom" isn't a valid React Flow PanelPosition, so fall back to a real
  // corner for the base placement (the inline style above overrides it).
  const rfMiniMapPosition = (miniMapPosition === "custom" ? "top-left" : miniMapPosition) as PanelPosition;

  const nodeColor = useCallback(
    (n: FewerNode) => n.data?.type === "folder" ? themeColors.folderBg : themeColors.fileBg,
    [themeColors],
  );
  const nodeStrokeColor = useCallback(
    (n: FewerNode) => n.data?.type === "folder" ? themeColors.folderIcon : themeColors.fileIcon,
    [themeColors],
  );

  return { showMiniMap, scrollAction, minimapStyle, rfMiniMapPosition, nodeColor, nodeStrokeColor };
}

