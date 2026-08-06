import { useGraphStore } from "./createStore";
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { useShallow } from "zustand/react/shallow";

/**
 * Selector hooks for graph data — memoized with shallow comparison
 * to prevent cascade re-renders on unrelated store changes.
 */

export function useNodes() {
  return useGraphStore((s) => s.nodes);
}

export function useEdges() {
  return useGraphStore((s) => s.edges);
}

export function useGraphData() {
  return useGraphStore(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges, hiddenIds: s.hiddenIds })),
  );
}

export function useLayoutConfig() {
  return useGraphStore(
    useShallow((s) => ({
      direction: s.direction,
      edgeStyle: s.edgeStyle,
      edgeAnimated: s.edgeAnimated,
      edgeStrokeStyle: s.edgeStrokeStyle,
      edgeWidth: s.edgeWidth,
      cornerRadius: s.cornerRadius,
      nodeWidth: s.nodeWidth,
      nodeHeight: s.nodeHeight,
    })),
  );
}

export function useThemeConfig() {
  return useGraphStore(
    useShallow((s) => ({
      themeMode: s.themeMode,
      customTheme: s.customTheme,
    })),
  );
}

export function useUiState() {
  return useGraphStore(
    useShallow((s) => ({
      searchQuery: s.searchQuery,
      selectedNodeIds: s.selectedNodeIds,
      renamingId: s.renamingId,
      sidebarOpen: s.sidebarOpen,
      searchOpen: s.searchOpen,
      exportOpen: s.exportOpen,
      showMiniMap: s.showMiniMap,
      miniMapPosition: s.miniMapPosition,
      miniMapSize: s.miniMapSize,
      advancedModeEnabled: s.advancedModeEnabled,
      showFiles: s.showFiles,
      loading: s.loading,
    })),
  );
}

export function useGraphVersion() {
  return useGraphStore((s) => s.graphVersion);
}

export function useZoomToNode() {
  return useGraphStore((s) => s.zoomToNode);
}

export function useZoomToNodeIds() {
  return useGraphStore((s) => s.zoomToNodeIds);
}

export function useMousePosition() {
  return useGraphStore((s) => s.mousePosition);
}

export function usePastePosition() {
  return useGraphStore((s) => s.pastePosition);
}