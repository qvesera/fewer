"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  PanOnScrollMode,
  useReactFlow,
  useNodesState,
  useEdgesState,
  useUpdateNodeInternals,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CustomNode, KeyboardShortcuts } from ".";
import { groupBatchActions } from "@/lib/fewer/menuSections";
import { selectByTag } from "@/lib/fewer/batchSelect";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { edgeTypeFor } from "@/lib/fewer/edgeHighlight";
import { cn } from "@/lib/utils";
import { FolderOpen, Sparkles, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStrokeStyle } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";
import { useGraphData, useLayoutConfig, useThemeConfig, useUiState, useViewState, useStoreActions } from "@/store/hooks";

// Hooks (Phase C extraction — each is a cohesive, single-concern unit).
import { useCanvasResize } from "@/hooks/use-canvas-resize";
import { useCanvasThemeColors, type CanvasThemeColors } from "@/hooks/use-canvas-theme-colors";
import { useCanvasVisibleGraph } from "@/hooks/use-canvas-visible-graph";
import { useCanvasGraphSync } from "@/hooks/use-canvas-graph-sync";
import { useCanvasDashClock } from "@/hooks/use-canvas-dash-clock";
import { useCanvasDirectionRemeasure } from "@/hooks/use-canvas-direction-remeasure";
import { useCanvasInitialFit } from "@/hooks/use-canvas-initial-fit";
import { resolveViewNodes, withCollapsedPillGeometry } from "@/lib/fewer/viewState";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { useCanvasZoomToNode } from "@/hooks/use-canvas-zoom-to-node";
import { useCanvasMinimap } from "@/hooks/use-canvas-minimap";
import { useCanvasNodeDrag } from "@/hooks/use-canvas-node-drag";
import { useCanvasNodeChangeHandler } from "@/hooks/use-canvas-node-change-handler";
import { useCanvasBoxSelect } from "@/hooks/use-canvas-box-select";
import { useCanvasDrop } from "@/hooks/use-canvas-drop";
import { useCanvasCtrlWheelPan } from "@/hooks/use-canvas-ctrl-wheel-pan";
import { useCanvasEdges } from "@/hooks/use-canvas-edges";
import { useCanvasConnect } from "@/hooks/use-canvas-connect";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";
import { resolveViewSettings } from "@/lib/fewer/viewState";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";

import { GraphViewProvider } from "@/hooks/use-graph-view-context";
import { CanvasOverlays } from "./CanvasOverlays";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { CanvasZoomControls } from "./CanvasZoomControls";
import { useCanvasDelete } from "@/hooks/use-canvas-delete";
import { useCanvasInteractionHandlers } from "@/hooks/use-canvas-interaction-handlers";
import { useCanvasDragRecording } from "@/hooks/use-canvas-drag-recording";
import { useCanvasCollapsedInternals } from "@/hooks/use-canvas-collapsed-internals";
import { useCanvasHiddenChip } from "@/hooks/use-canvas-hidden-chip";

const nodeTypes = { folder: CustomNode, file: CustomNode };
const PERF_NODE_LIMIT = 300;

interface CanvasMenuPosition { x: number; y: number; }
interface CanvasEmptyActionsProps { onOpenImport: () => void; onLoadSample: () => void; primary?: boolean; leafId?: string; }
type CanvasMenu = CanvasMenuPosition & { kind: "pane" | "edge" | "selection" };
type CanvasToast = ReturnType<typeof useToast>["toast"];

/** Shared edge-animation configuration assembled from store state. */
function useEdgeAnimationOpts(
  advancedModeEnabled: boolean,
  edgeAnimated: boolean,
  edgeAnimatedSelectedOnly: boolean,
  edgeAnimatedStrokeStyle: EdgeStrokeStyle,
  edgeStrokeStyle: EdgeStrokeStyle,
) {
  return useMemo(
    () => ({
      animated: advancedModeEnabled && edgeAnimated,
      selectedOnly: advancedModeEnabled && edgeAnimatedSelectedOnly,
      animatedStrokeStyle: edgeAnimatedStrokeStyle,
      baseStrokeStyle: edgeStrokeStyle,
    }),
    [advancedModeEnabled, edgeAnimated, edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, edgeStrokeStyle],
  );
}

function CanvasInner({ onOpenImport, onLoadSample, primary = true, leafId }: CanvasEmptyActionsProps) {
  const { nodes: allNodes, edges: allEdges, hiddenIds } = useGraphData();
  const { direction, edgeStyle: edgeStyleGlobal, edgeAnimated: edgeAnimatedGlobal, edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyle: edgeStrokeStyleGlobal, edgeAnimatedStrokeStyle, edgeWidth: edgeWidthGlobal } = useLayoutConfig();
  const { themeMode: themeModeGlobal, customTheme } = useThemeConfig();
  const { selectedNodeIds, advancedModeEnabled, loading, showFiles: showFilesGlobal } = useUiState();
  const { activeLeafId, viewSettings: viewSettingsMap, zoomToNode, zoomToNodeIds } = useViewState();
  const { setSelectedNodeIds, deleteNodes, recordDragMoves, recordResize, connectNodes, addStandaloneNode, setRenamingId, setCanvasSize, setNodePositionForLeaf, setZoomToNodeIds } = useStoreActions();
  const shynessScale = useGraphStore((s) => s.shynessScale);
  const sortKey = useGraphStore((s) => s.sortKey);
  const sortDir = useGraphStore((s) => s.sortDir);
  const tags = useGraphStore((s) => s.tags);
  const graphVersion = useGraphStore((s) => s.graphVersion);
  const seedNodePositions = useGraphStore((s) => s.seedNodePositions);

  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  // Per-view scope
  const isActive = leafId ? leafId === activeLeafId : true;

    // ── Resolve per-view settings ──
  // Memoized: a fresh array here would change the `vs` memo's deps every render,
  // producing new resolved objects and an infinite setRfEdges loop.
  const fileIds = useMemo(
    () => allNodes.filter((n) => n.data.type === "file").map((n) => n.id),
    [allNodes],
  );
  const vs = useMemo(
    () => resolveViewSettings(viewSettingsMap, leafId, {
      showFiles: showFilesGlobal, minimapHidden: false,
      edgeStyle: edgeStyleGlobal, edgeAnimated: edgeAnimatedGlobal,
      edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal,
      edgeStrokeStyle: edgeStrokeStyleGlobal, edgeWidth: edgeWidthGlobal,
      direction, hiddenIds, collapsedFolderIds: [],
    }, hiddenIds, fileIds),
    [viewSettingsMap, leafId, showFilesGlobal, edgeStyleGlobal, edgeAnimatedGlobal, edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyleGlobal, edgeWidthGlobal, direction, hiddenIds, fileIds],
  );

  const isDark = themeModeGlobal === "dark";

  // ── Hook extractions ──
  useCanvasResize(containerRef, setCanvasSize);
  const themeColors = useCanvasThemeColors(themeModeGlobal, isDark, customTheme);

  // Effective hiddenIds come from resolveViewSettings (which already computed
  // layers + bulk files from allFileIds). No showFiles special-case needed.
  const effectiveHiddenIds = vs.hiddenIds;

  const { visibleNodes, visibleEdges, hiddenCount } = useCanvasVisibleGraph(allNodes, allEdges, effectiveHiddenIds);

  // This leaf's own copies: folders it has collapsed paint as a compact pill.
  // Stamped before `resolveViewNodes` so the leaf's derived layout reserves a
  // pill-sized slot, and never written back — the shared store node keeps its
  // expanded height for every other view.
  const viewNodes = useMemo(
    () => withCollapsedPillGeometry(visibleNodes, vs.collapsedFolderIds),
    [visibleNodes, vs.collapsedFolderIds],
  );

  // ── Per-view positions: derive when direction overrides OR visible set diverges ──
  // Same predicate the Organize action uses (viewState.needsLayoutDerivation, via
  // resolveViewNodes) so a view never ends up half-organised — and the exporter
  // runs the identical resolution, so an image export mirrors the active view.
  const positionedNodes = useMemo(
    () =>
      resolveViewNodes(
        viewNodes,
        visibleEdges,
        leafId ? viewSettingsMap[leafId] : undefined,
        vs,
        { direction, hiddenIds, fileIds },
        { shynessScale, sortKey, sortDir, tagLabelById: makeTagLabelLookup(tags) },
      ),
    [viewNodes, visibleEdges, leafId, viewSettingsMap, vs, direction, hiddenIds, fileIds, shynessScale, sortKey, sortDir, tags],
  );

  const graphsExists = allNodes.length > 0;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(viewNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(visibleEdges);

  useCanvasGraphSync(graphVersion, positionedNodes, visibleEdges, setRfNodes, setRfEdges, leafId);
  useCanvasDashClock(advancedModeEnabled, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly);
  useCanvasDirectionRemeasure(vs.direction);

  const updateNodeInternals = useUpdateNodeInternals();
  useCanvasCollapsedInternals(vs.collapsedFolderIds, updateNodeInternals);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition, setViewport, getViewport, getEdges } = useReactFlow();
  useCanvasInitialFit(positionedNodes, containerRef, setViewport);
  useCanvasZoomToNode(isActive ? zoomToNode : null, isActive ? useGraphStore.getState().zoomToNodeIds : null, fitView, setZoomToNodeIds);
  const mini = useCanvasMinimap({ themeColors, isDark, leafId });

  const { seedOnFirstDrag, effectiveRecordDragMoves } = useCanvasDragRecording({
    leafId, positionedNodes, seedNodePositions, setNodePositionForLeaf, recordDragMoves,
  });
  const dragHandlers = useCanvasNodeDrag(effectiveRecordDragMoves);
  const { baseRef: boxSelectBaseRef, onPointerDownCapture, onPointerUp, onPointerCancel } = useCanvasBoxSelect({ selectedNodeIds, setRfNodes });
  const handleNodesChange = useCanvasNodeChangeHandler({ onNodesChange, fitView, recordResize, boxSelectBaseRef, leafId, collapsedIds: vs.collapsedFolderIds, onBeforePositionCommit: seedOnFirstDrag });
  const { onDrop, onDragOver } = useCanvasDrop({ screenToFlowPosition, addStandaloneNode, toast });
  useCanvasCtrlWheelPan(containerRef, mini.scrollAction === "zoom");

  const animation = useEdgeAnimationOpts(advancedModeEnabled, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, vs.edgeStrokeStyle);

  // Edge handling (selection tracking + highlight rebuild + static dash) lives
  // in useCanvasEdges so CanvasInner stays declarative. Effects/callbacks read
  // live store state to avoid unstable reference deps.
  const { handleEdgesChange, dashArray, selectedEdgeIdsRef } = useCanvasEdges({
    onEdgesChange, setRfEdges, graphVersion, allNodes, themeColors, vs, animation, leafId, isActive,
  });

  const { onSelectionChange, onNodeDoubleClick, fitToSelection, selectAll } = useCanvasSelection({
    setSelectedNodeIds, setRfNodes, boxSelectBaseRef, selectedEdgeIdsRef, fitView, leafId,
  });

  const { onConnect, onConnectEnd } = useCanvasConnect({
    connectNodes, setRfEdges, edgeStyle: vs.edgeStyle, screenToFlowPosition, toast,
  });

  const onDelete = useCanvasDelete({
    deleteNodes,
    deleteEdges: (ids: string[]) => useGraphStore.getState().deleteEdges(ids),
    toast,
  });

  const {
    canvasMenu, lastClickedEdgeId, closeMenu,
    onPaneClick, onEdgeContextMenu, onPaneContextMenu,
    onSelectionContextMenu, onNodeContextMenu, onMouseMove,
  } = useCanvasInteractionHandlers({ setRenamingId, leafId, screenToFlowPosition });

  const hiddenChipStyle = useCanvasHiddenChip();

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  return (
    <GraphViewProvider value={{ leafId: leafId ?? "primary", isActive: leafId ? leafId === activeLeafId : true, direction: vs.direction, resolved: vs, visibleIds }}>
    <div ref={containerRef} className={cn("relative h-full w-full select-none", allNodes.length > PERF_NODE_LIMIT && "gm-perf")} style={{ background: "var(--fewer-background-gradient, var(--fewer-background))" }} onDrop={onDrop} onDragOver={onDragOver}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange as import("@xyflow/react").OnNodesChange}
        onEdgesChange={handleEdgesChange as import("@xyflow/react").OnEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd as import("@xyflow/react").OnConnectEnd}
        onPaneClick={onPaneClick}
        onNodeDragStart={dragHandlers.onNodeDragStart} onNodeDragStop={dragHandlers.onNodeDragStop}
        onSelectionDragStart={dragHandlers.onSelectionDragStart} onSelectionDragStop={dragHandlers.onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onDelete={onDelete}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onMouseMove={onMouseMove}
        deleteKeyCode={null}
        nodesDraggable nodesConnectable elementsSelectable
        onlyRenderVisibleElements
        zoomOnScroll={mini.scrollAction === "zoom"}
        panOnScroll={mini.scrollAction === "pan"}
        panOnScrollMode={PanOnScrollMode.Vertical}
        zoomActivationKeyCode={mini.scrollAction === "pan" ? "Control" : null}
        panActivationKeyCode={mini.scrollAction === "zoom" ? "Control" : null}
        fitViewOptions={{ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }}
        minZoom={0.15} maxZoom={3}
        defaultEdgeOptions={{
          type: edgeTypeFor(vs.edgeStyle), animated: advancedModeEnabled && vs.edgeAnimated && !vs.edgeAnimatedSelectedOnly,
          style: { stroke: themeColors.edge, strokeWidth: vs.edgeWidth, ...(dashArray ? { strokeDasharray: dashArray } : {}) },
          zIndex: 0,
        }}
        elevateNodesOnSelect
        proOptions={{ hideAttribution: true }}
        className="bg-transparent h-full w-full"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color={themeColors.bgDot} className="transition-colors" />
        {mini.showMiniMap && (
          <MiniMap position={mini.rfMiniMapPosition} style={mini.minimapStyle} pannable zoomable nodeColor={mini.nodeColor} nodeStrokeColor={mini.nodeStrokeColor} nodeStrokeWidth={2} nodeBorderRadius={4} ariaLabel="Mini map" />
        )}
        <CanvasZoomControls zoomIn={zoomIn} zoomOut={zoomOut} fitView={fitView} fitToSelection={fitToSelection} />
        <CanvasOverlays
          loading={loading}
          rfNodesCount={rfNodes.length}
          graphsExists={graphsExists}
          vs={vs}
          leafId={leafId}
          onOpenImport={onOpenImport}
          onLoadSample={onLoadSample}
          hiddenCount={hiddenCount}
          hiddenChipStyle={hiddenChipStyle}
        />
      </ReactFlow>

      {canvasMenu && (
        <CanvasContextMenu
          menu={canvasMenu}
          lastClickedEdgeId={lastClickedEdgeId}
          vs={vs}
          leafId={leafId}
          advancedModeEnabled={advancedModeEnabled}
          hiddenCount={hiddenCount}
          allNodes={allNodes}
          selectAll={selectAll}
          close={closeMenu}
        />
      )}
      {primary && <KeyboardShortcuts />}
    </div>
    </GraphViewProvider>
  );
}

interface GraphCanvasProps {
  onOpenImport: () => void;
  onLoadSample: () => void;
  /** Primary viewport gets keyboard shortcuts; secondary viewports skip them. */
  primary?: boolean;
  /** Leaf id for per-view minimap visibility tracking. */
  leafId?: string;
}

export function GraphCanvas({ onOpenImport, onLoadSample, primary = true, leafId }: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner onOpenImport={onOpenImport} onLoadSample={onLoadSample} primary={primary} leafId={leafId} />
    </ReactFlowProvider>
  );
}
