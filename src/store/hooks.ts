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
      edgeAnimatedSelectedOnly: s.edgeAnimatedSelectedOnly,
      edgeStrokeStyle: s.edgeStrokeStyle,
      edgeAnimatedStrokeStyle: s.edgeAnimatedStrokeStyle,
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

// ---------------------------------------------------------------------------
//  Per-file selector hooks — replaces hand-rolled `useGraphStore((s) => s.X)`
//  blocks that duplicated across ExportPanel, FewerApp, Sidebar, etc.
//
//  Rules for new hooks:
//  - Narrow state for render-critical components (CustomNode, GraphCanvas)
//    that render per-node/edge and must not subscribe to unrelated state.
//  - Broad domain hooks for shell components (ExportPanel, FewerApp, Sidebar)
//    that are not on the hot path.
//  - useShallow on every object return.
// ---------------------------------------------------------------------------

/** All store action functions — identity-stable, zero re-render cost. */
export function useStoreActions() {
  return useGraphStore(
    useShallow((s) => ({
      deleteNodes: s.deleteNodes,
      renameNode: s.renameNode,
      duplicateNodeUnderParent: s.duplicateNodeUnderParent,
      pasteFromClipboard: s.pasteFromClipboard,
      setClipboard: s.setClipboard,
      pasteNode: s.pasteNode,
      addNode: s.addNode,
      addStandaloneNode: s.addStandaloneNode,
      addParentNode: s.addParentNode,
      setSelectedNodeIds: s.setSelectedNodeIds,
      setRenamingId: s.setRenamingId,
      recordDragMoves: s.recordDragMoves,
      recordResize: s.recordResize,
      connectNodes: s.connectNodes,
      setCanvasSize: s.setCanvasSize,
      setZoomToNodeIds: s.setZoomToNodeIds,
      setNodePositionForLeaf: s.setNodePositionForLeaf,
      reset: s.reset,
      setDirection: s.setDirection,
      setEdgeStyle: s.setEdgeStyle,
      organize: s.organize,
      showAll: s.showAll,
      revealAllForLeaf: s.revealAllForLeaf,
      showAllTags: s.showAllTags,
      setFilesBulkForLeaf: s.setFilesBulkForLeaf,
      setShowFiles: s.setShowFiles,
      selectByTag: s.selectByTag,
      pastePosition: s.pastePosition,
      mousePosition: s.mousePosition,
    })),
  );
}

/** Per-view panel state — activeLeafId, viewSettings, panelTree. */
export function useViewState() {
  return useGraphStore(
    useShallow((s) => ({
      activeLeafId: s.activeLeafId,
      viewSettings: s.viewSettings,
      panelTree: s.panelTree,
      zoomToNode: s.zoomToNode,
      zoomToNodeIds: s.zoomToNodeIds,
    })),
  );
}

/** Dialog open/close booleans + setters. */
export function useDialogState() {
  return useGraphStore(
    useShallow((s) => ({
      importFlowOpen: s.importFlowOpen,
      addChildOpen: s.addChildOpen,
      addStandaloneOpen: s.addStandaloneOpen,
      addParentOpen: s.addParentOpen,
      notificationOpen: s.notificationOpen,
      authOpen: s.authOpen,
      sidebarSide: s.sidebarSide,
      setImportFlowOpen: s.setImportFlowOpen,
      setAddChildOpen: s.setAddChildOpen,
      setAddStandaloneOpen: s.setAddStandaloneOpen,
      setAddParentOpen: s.setAddParentOpen,
      setNotificationOpen: s.setNotificationOpen,
      setAuthOpen: s.setAuthOpen,
      setSidebarSide: s.setSidebarSide,
      setSidebarOpen: s.setSidebarOpen,
    })),
  );
}