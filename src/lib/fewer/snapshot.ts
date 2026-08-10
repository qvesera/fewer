import { useGraphStore } from "@/store/graphStore";
import type { SavedGraphData } from "./savedGraphs";

/**
 * Capture the current full app state into a serializable snapshot.
 * Used for saving graphs to the account.
 */
export function buildSnapshot(): SavedGraphData {
  const s = useGraphStore.getState();
  return {
    nodes: s.nodes,
    edges: s.edges,
    direction: s.direction,
    edgeStyle: s.edgeStyle,
    edgeAnimated: s.edgeAnimated,
    edgeStrokeStyle: s.edgeStrokeStyle,
    edgeWidth: s.edgeWidth,
    cornerRadius: s.cornerRadius,
    nodeWidth: s.nodeWidth,
    nodeHeight: s.nodeHeight,
    themeMode: s.themeMode,
    customTheme: s.customTheme,
    showFiles: s.showFiles,
    maxDisplayDepth: s.maxDisplayDepth,
    autoHideThreshold: s.autoHideThreshold,
    showMiniMap: s.showMiniMap,
    miniMapPosition: s.miniMapPosition,
    miniMapSize: s.miniMapSize,
  };
}

/**
 * Restore a snapshot into the store.
 */
export function applySnapshot(data: SavedGraphData) {
  const s = useGraphStore.getState();
  s.setGraph(data.nodes as never, data.edges as never, false);
  s.setDirection(data.direction);
  s.setEdgeStyle(data.edgeStyle);
  s.setEdgeAnimated(data.edgeAnimated);
  s.setEdgeStrokeStyle(data.edgeStrokeStyle as never);
  s.setEdgeWidth(data.edgeWidth);
  s.setCornerRadius(data.cornerRadius);
  s.setNodeDimensions(data.nodeWidth, data.nodeHeight);
  s.setThemeMode(data.themeMode);
  if (data.customTheme) s.setCustomTheme(data.customTheme);
  s.setShowFiles(data.showFiles);
  s.setMaxDisplayDepth(data.maxDisplayDepth);
  s.setAutoHideThreshold(data.autoHideThreshold);
  s.setShowMiniMap(data.showMiniMap);
  s.setMiniMapPosition(data.miniMapPosition as never);
  s.setMiniMapSize(data.miniMapSize);
  useGraphStore.setState({ dataSource: "saved" });
}