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
    miniMapX: s.miniMapX,
    miniMapY: s.miniMapY,
    scrollAction: s.scrollAction,
    localRootPath: s.localRootPath,
  };
}

/**
 * Restore a snapshot into the store.
 */
export function applySnapshot(data: SavedGraphData) {
  const s = useGraphStore.getState();

  // Apply appearance/scalar settings directly — NOT via the layout setters
  // (setDirection/setNodeDimensions/setShowFiles/…) which re-run the tree layout
  // and would scatter the saved node positions. The graph load below honours
  // these values while keeping positions intact.
  useGraphStore.setState({
    direction: data.direction,
    edgeStyle: data.edgeStyle,
    edgeAnimated: data.edgeAnimated,
    edgeStrokeStyle: data.edgeStrokeStyle as never,
    edgeWidth: data.edgeWidth,
    nodeWidth: data.nodeWidth,
    nodeHeight: data.nodeHeight,
    showFiles: data.showFiles,
    maxDisplayDepth: data.maxDisplayDepth,
    autoHideThreshold: data.autoHideThreshold,
    showMiniMap: data.showMiniMap,
    miniMapPosition: data.miniMapPosition as never,
    miniMapSize: data.miniMapSize,
    miniMapX: data.miniMapX ?? s.miniMapX,
    miniMapY: data.miniMapY ?? s.miniMapY,
    scrollAction: data.scrollAction ?? s.scrollAction,
  });

  s.setGraph(data.nodes as never, data.edges as never, false, undefined, { preservePositions: true });

  // Edge path options (corner radius) can only be set once the edges exist;
  // setCornerRadius does not re-lay-out, so positions are preserved.
  s.setCornerRadius(data.cornerRadius);

  // Theme is an account-level preference (synced to the cloud separately), so
  // loading a graph must NOT clobber the user's current theme.
  useGraphStore.setState({
    dataSource: "saved",
    localRootPath: data.localRootPath ?? null,
    skipNextAutoLayout: true,
  });
}