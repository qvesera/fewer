"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  PanOnScrollMode,
  useReactFlow,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CustomNode, KeyboardShortcuts } from ".";
import { buildBatchActions } from "@/lib/fewer/batchActions";
import { edgeDashPattern } from "@/lib/fewer/types";
import { buildSelectedEdgeHighlight } from "@/lib/fewer/edgeHighlight";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, Maximize2, Crosshair, FolderOpen, Sparkles, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStyle, EdgeStrokeStyle, FewerEdge, FewerNode } from "@/lib/fewer/types";
import type { OnSelectionChangeParams } from "@xyflow/react";
import { useGraphStore } from "@/store/graphStore";
import { FEWER_ADD_NODE } from "@/lib/fewer/keyboardShortcuts";

// Hooks (Phase C extraction — each is a cohesive, single-concern unit).
import { useCanvasResize } from "@/hooks/use-canvas-resize";
import { useCanvasThemeColors, type CanvasThemeColors } from "@/hooks/use-canvas-theme-colors";
import { useCanvasVisibleGraph } from "@/hooks/use-canvas-visible-graph";
import { useCanvasGraphSync } from "@/hooks/use-canvas-graph-sync";
import { useCanvasDashClock } from "@/hooks/use-canvas-dash-clock";
import { useCanvasDirectionRemeasure } from "@/hooks/use-canvas-direction-remeasure";
import { useCanvasInitialFit } from "@/hooks/use-canvas-initial-fit";
import { useCanvasZoomToNode } from "@/hooks/use-canvas-zoom-to-node";
import { useCanvasMinimap } from "@/hooks/use-canvas-minimap";
import { useCanvasNodeDrag } from "@/hooks/use-canvas-node-drag";
import { useCanvasNodeChangeHandler } from "@/hooks/use-canvas-node-change-handler";
import { useCanvasBoxSelect } from "@/hooks/use-canvas-box-select";
import { useCanvasDrop } from "@/hooks/use-canvas-drop";

const nodeTypes = { folder: CustomNode, file: CustomNode };
const PERF_NODE_LIMIT = 300;

function edgeTypeFor(style: EdgeStyle): FewerEdge["type"] {
  switch (style) {
    case "curved": return "default";
    case "angled": return "smoothstep";
    case "straight": return "straight";
  }
}

interface CanvasMenuPosition { x: number; y: number; }
interface CanvasEmptyActionsProps { onOpenImport: () => void; onLoadSample: () => void; }

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

function CanvasInner({ onOpenImport, onLoadSample }: CanvasEmptyActionsProps) {
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const edgeAnimated = useGraphStore((s) => s.edgeAnimated);
  const edgeAnimatedSelectedOnly = useGraphStore((s) => s.edgeAnimatedSelectedOnly);
  const edgeStrokeStyle = useGraphStore((s) => s.edgeStrokeStyle);
  const edgeAnimatedStrokeStyle = useGraphStore((s) => s.edgeAnimatedStrokeStyle);
  const edgeWidth = useGraphStore((s) => s.edgeWidth);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const recordDragMoves = useGraphStore((s) => s.recordDragMoves);
  const recordResize = useGraphStore((s) => s.recordResize);
  const connectNodes = useGraphStore((s) => s.connectNodes);
  const loading = useGraphStore((s) => s.loading);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const setCanvasSize = useGraphStore((s) => s.setCanvasSize);
  const themeMode = useGraphStore((s) => s.themeMode);
  const customTheme = useGraphStore((s) => s.customTheme);
  const direction = useGraphStore((s) => s.direction);
  const isDark = themeMode === "dark";
  const hoverHighlightIds = useGraphStore((s) => s.hoverHighlightIds);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const setZoomToNodeIds = useGraphStore((s) => s.setZoomToNodeIds);
  const graphVersion = useGraphStore((s) => s.graphVersion);
  const relayout = useGraphStore((s) => s.relayout);

  // ── Hook extractions (pure moves, no behavior change) ──
  useCanvasResize(containerRef, setCanvasSize);
  const themeColors = useCanvasThemeColors(themeMode, isDark, customTheme);
  const { visibleNodes, visibleEdges, hiddenCount } = useCanvasVisibleGraph(allNodes, allEdges, hiddenIds);
  const graphsExists = allNodes.length > 0;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(visibleNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(visibleEdges);
  void onEdgesChange; // reserved for parity; RF drives edges via graphVersion sync

  useCanvasGraphSync(graphVersion, visibleNodes, visibleEdges, setRfNodes, setRfEdges);
  useCanvasDashClock(advancedModeEnabled, edgeAnimated, edgeAnimatedSelectedOnly);
  useCanvasDirectionRemeasure(direction);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition, setViewport } = useReactFlow();
  useCanvasInitialFit(visibleNodes, containerRef, setViewport);
  const zoomToNode = useGraphStore((s) => s.zoomToNode);
  useCanvasZoomToNode(zoomToNode, useGraphStore((s) => s.zoomToNodeIds), fitView, setZoomToNodeIds);
  const mini = useCanvasMinimap({ themeColors, isDark });
  const dragHandlers = useCanvasNodeDrag(recordDragMoves);
  const { baseRef: boxSelectBaseRef, onPointerDownCapture, onPointerUp, onPointerCancel } = useCanvasBoxSelect({ selectedNodeIds, setRfNodes });
  const handleNodesChange = useCanvasNodeChangeHandler({ onNodesChange, relayout, fitView, recordResize, boxSelectBaseRef });
  const { onDrop, onDragOver } = useCanvasDrop({ screenToFlowPosition, addStandaloneNode, toast });

  const animation = useEdgeAnimationOpts(advancedModeEnabled, edgeAnimated, edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, edgeStrokeStyle);
  // ── Re-apply edge highlight on graph/theme/edge changes (see useEdgeHighlight). ──
  useEffect(() => {
    const updatedEdges = buildSelectedEdgeHighlight(selectedNodeIds, hoverHighlightIds, allEdges, allNodes, themeColors, edgeWidth, animation);
    // Update only React Flow edges; store edges are already synced via useCanvasGraphSync.
    setRfEdges(updatedEdges.filter((e: FewerEdge) => {
      const hidden = new Set(hiddenIds);
      return !hidden.has(e.source) && !hidden.has(e.target);
    }));
  }, [themeColors, setRfEdges, edgeWidth, graphVersion, advancedModeEnabled, edgeAnimated, edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, edgeStrokeStyle, selectedNodeIds, hoverHighlightIds, allEdges, allNodes, hiddenIds, animation]);

  const dashArray = useMemo(() => {
    switch (edgeStrokeStyle) {
      case "dashed": return "6 6";
      case "dotted": return "2 6";
      case "solid":
      default: return undefined;
    }
  }, [edgeStrokeStyle]);

  const [canvasMenu, setCanvasMenu] = useState<(CanvasMenuPosition & { kind: "pane" | "edge" | "selection" }) | null>(null);
  const [lastClickedEdgeId, setLastClickedEdgeId] = useState<string | null>(null);

  // ── Selection: highlight ancestor path for EVERY selected node ──
  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
            const selectedIds = new Set(selected.map((n) => n.id));
      const prevIds = useGraphStore.getState().selectedNodeIds;
      const base = boxSelectBaseRef.current;
      const newIds = base
        ? [...new Set([...base, ...selectedIds])]
        : [
            ...prevIds.filter((id: string) => selectedIds.has(id)),
                        ...selected.filter((n) => !prevIds.includes(n.id)).map((n) => n.id),
          ];
      setSelectedNodeIds(newIds);

      const { edges, nodes, hiddenIds: hidden, hoverHighlightIds: currentHover, edgeAnimated: anim, edgeAnimatedSelectedOnly: animSelectedOnly, edgeAnimatedStrokeStyle: selStroke, edgeStrokeStyle: selBase } = useGraphStore.getState();
      const updatedEdges = buildSelectedEdgeHighlight(newIds, currentHover, edges, nodes, themeColors, edgeWidth, { animated: advancedModeEnabled && anim, selectedOnly: advancedModeEnabled && animSelectedOnly, animatedStrokeStyle: selStroke, baseStrokeStyle: selBase });
      useGraphStore.setState({ edges: updatedEdges });
      const hiddenSet = new Set(hidden);
      setRfEdges(updatedEdges.filter((e: FewerEdge) => !hiddenSet.has(e.source) && !hiddenSet.has(e.target)));
    },
    [setSelectedNodeIds, setRfEdges, edgeWidth, themeColors, advancedModeEnabled, boxSelectBaseRef],
  );

  const onConnect = useCallback(
    (connection) => {
      const result = connectNodes(connection);
      if (!result.ok) {
        toast({ title: "Connection rejected", description: result.reason, variant: "destructive" });
      } else if (connection.source && connection.target) {
        setRfEdges((eds) => [...eds, { id: `e-${connection.source}-${connection.target}-${Date.now()}`, source: connection.source, target: connection.target, type: edgeTypeFor(edgeStyle) }]);
      }
    },
    [connectNodes, toast, setRfEdges, edgeStyle],
  );

  const onConnectEnd = useCallback(
    (_: unknown, connectionState: { isValid: boolean | null; fromNode?: { id: string; data?: { type?: string } } }) => {
      if (!connectionState.isValid && connectionState.fromNode?.data?.type === "folder") {
        const store = useGraphStore.getState();
        store.setSelectedNodeIds([connectionState.fromNode.id]);
        window.dispatchEvent(new CustomEvent(FEWER_ADD_NODE));
      }
    },
    [],
  );

  const fitToSelection = useCallback(() => {
    const selected = useGraphStore.getState().selectedNodeIds;
    if (selected.length === 0) { fitView({ duration: 600, padding: 0.2 }); return; }
    fitView({ nodes: selected.map((id: string) => ({ id })), duration: 600, padding: 0.3 });
  }, [fitView]);

  const selectAll = useCallback(() => {
    const ids = useGraphStore.getState().nodes.map((n: FewerNode) => n.id);
    useGraphStore.setState((s) => ({ nodes: s.nodes.map((n: FewerNode) => ({ ...n, selected: true })), selectedNodeIds: ids }));
    setRfNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
  }, [setRfNodes]);

  const hiddenChipStyle = useMemo(() => {
    const bg = (() => {
      if (typeof document === "undefined") return "#0b0b13";
      const v = getComputedStyle(document.documentElement).getPropertyValue("--fewer-background").trim();
      return v || "#0b0b13";
    })();
    const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim());
    if (!m) return {};
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    if (luminance > 128) {
      return { backgroundColor: `rgba(${Math.round(r * 0.25)}, ${Math.round(g * 0.25)}, ${Math.round(b * 0.25)}, 0.8)`, color: "rgba(255, 255, 255, 0.9)" };
    }
    return { backgroundColor: `rgba(${Math.min(255, Math.round(r * 0.5 + 128))}, ${Math.min(255, Math.round(g * 0.5 + 128))}, ${Math.min(255, Math.round(b * 0.5 + 128))}, 0.8)`, color: "rgba(0, 0, 0, 0.85)" };
  }, []);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full select-none", allNodes.length > PERF_NODE_LIMIT && "gm-perf")} style={{ backgroundColor: "var(--fewer-background)" }} onDrop={onDrop} onDragOver={onDragOver}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange as import("@xyflow/react").OnNodesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd as import("@xyflow/react").OnConnectEnd}
        onPaneClick={() => setRenamingId(null)}
        onNodeDragStart={dragHandlers.onNodeDragStart} onNodeDragStop={dragHandlers.onNodeDragStop}
        onSelectionDragStart={dragHandlers.onSelectionDragStart} onSelectionDragStop={dragHandlers.onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={(_, node) => {
          useGraphStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: n.id === node.id })), selectedNodeIds: [node.id] }));
          requestAnimationFrame(() => fitView({ nodes: [{ id: node.id }], duration: 600, padding: 0.3, maxZoom: 1.5 }));
        }}
        onDelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
          if (deletedNodes.length > 0) {
            deleteNodes(deletedNodes.map((n: FewerNode) => n.id));
            toast({ title: "Deleted", description: `${deletedNodes.length} item${deletedNodes.length === 1 ? "" : "s"} removed` });
          }
          if (deletedEdges.length > 0) {
            useGraphStore.getState().deleteEdges(deletedEdges.map((e: FewerEdge) => e.id));
            toast({ title: "Deleted", description: `${deletedEdges.length} edge${deletedEdges.length === 1 ? "" : "s"} removed` });
          }
        }}
        onNodeContextMenu={(event) => event.preventDefault()}
        onEdgeContextMenu={(event, edge) => { event.preventDefault(); setLastClickedEdgeId(edge.id); setCanvasMenu({ x: event.clientX, y: event.clientY, kind: "edge" }); }}
        onPaneContextMenu={(e) => { e.preventDefault(); const mouseEvent = e as unknown as MouseEvent; setCanvasMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, kind: "pane" }); setLastClickedEdgeId(null); useGraphStore.getState().setRightClickDetected(); }}
        onSelectionContextMenu={(e) => { e.preventDefault(); setCanvasMenu({ x: e.clientX, y: e.clientY, kind: "selection" }); setLastClickedEdgeId(null); useGraphStore.getState().setRightClickDetected(); }}
        onMouseMove={(e) => { const point = screenToFlowPosition({ x: e.clientX, y: e.clientY }); useGraphStore.getState().setMousePosition({ x: point.x, y: point.y }); }}
        nodesDraggable nodesConnectable elementsSelectable
        onlyRenderVisibleElements
        zoomOnScroll={mini.scrollAction === "zoom"}
        panOnScroll={mini.scrollAction === "pan"}
        panOnScrollMode={PanOnScrollMode.Vertical}
        zoomActivationKeyCode={mini.scrollAction === "pan" ? "Control" : null}
        fitViewOptions={{ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }}
        minZoom={0.15} maxZoom={3}
        defaultEdgeOptions={{
          type: edgeTypeFor(edgeStyle), animated: advancedModeEnabled && edgeAnimated && !edgeAnimatedSelectedOnly,
          style: { stroke: themeColors.edge, strokeWidth: edgeWidth, ...(dashArray ? { strokeDasharray: dashArray } : {}) },
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
        <Panel position="bottom-center">
          <div className="gm-float flex items-center gap-1 rounded-2xl p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => zoomIn({ duration: 250 })} title="Zoom in (+)"><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => zoomOut({ duration: 250 })} title="Zoom out (-)"><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => fitView({ duration: 600, padding: 0.2 })} title="Fit view (Space)"><Maximize2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={fitToSelection} title="Zoom to selection"><Crosshair className="h-4 w-4" /></Button>
          </div>
        </Panel>
        {loading && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            </div>
          </Panel>
        )}
        {!loading && rfNodes.length === 0 && graphsExists && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <EyeOff className="h-12 w-12 text-muted-foreground/60" />
              <div className="text-lg font-semibold">Everything is hidden</div>
              <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">
                {showFiles
                  ? "All nodes on this graph are currently hidden on the canvas."
                  : "This graph is made only of files and \"Show Files\" is off, so nothing is displayed."}
              </div>
              {!showFiles && (
                <Button variant="outline" onClick={() => setShowFiles(true)} data-tutorial="show-files-button">
                  <FolderOpen className="h-4 w-4" />
                  Show Files
                </Button>
              )}
            </div>
          </Panel>
        )}
        {!loading && rfNodes.length === 0 && !graphsExists && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <FolderOpen className="h-12 w-12 text-muted-foreground/60" />
              <div className="text-lg font-semibold">No directory loaded</div>
              <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">Use the sidebar to open a directory from your file system, or load one of the sample datasets to explore the visualization.</div>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Button onClick={onOpenImport} data-tutorial="sample-button">
                  <FolderOpen className="h-4 w-4" />
                  Import
                </Button>
                <Button variant="outline" onClick={onLoadSample} data-tutorial="sample-button">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Load sample
                </Button>
              </div>
            </div>
          </Panel>
        )}
        {hiddenCount > 0 && (
          <Panel position="top-right">
            <button className="rounded-full px-3 py-1.5 text-xs cursor-pointer transition-colors animate-in fade-in slide-in-from-right-2 duration-200 backdrop-blur-md" style={hiddenChipStyle}
              onClick={() => { useGraphStore.getState().setSidebarOpen(true); useGraphStore.getState().triggerHiddenPanelExpand(); }}>
              {hiddenCount} node{hiddenCount === 1 ? "" : "s"} hidden
            </button>
          </Panel>
        )}
      </ReactFlow>

      {canvasMenu && (() => {
        const close = () => setCanvasMenu(null);
        const ids = useGraphStore.getState().selectedNodeIds;
        const isSelectionMenu = canvasMenu.kind === "selection" && ids.length >= 2;
        const edgeId = lastClickedEdgeId;
        const edgeExists = !isSelectionMenu && !!edgeId && useGraphStore.getState().edges.some((e: FewerEdge) => e.id === edgeId);
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
            <div className="gm-float fixed z-50 min-w-[200px] rounded-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150" style={{ left: canvasMenu.x, top: canvasMenu.y }}>
              {isSelectionMenu ? (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Batch actions · {ids.length} selected</div>
                  {buildBatchActions({ toast, selectedIds: ids }).map((action) => (
                    <button
                      key={action.id}
                      onClick={() => { action.run(); close(); }}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98] ${action.danger ? "text-red-500" : "text-foreground"}`}>
                      {action.label}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Canvas actions</div>
                  <div className="my-1 h-px bg-border/40" />
                  <button onClick={() => { fitView({ duration: 500, padding: 0.2 }); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Fit View</button>
                  <button onClick={() => { selectAll(); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Select All</button>
                  <button onClick={() => { zoomIn({ duration: 250 }); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Zoom In</button>
                  <button onClick={() => { zoomOut({ duration: 250 }); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]">Zoom Out</button>
                  {edgeExists && (
                    <>
                      <div className="my-1 h-px bg-border/40" />
                      <button onClick={() => { useGraphStore.getState().deleteEdges([edgeId!]); toast({ title: "Edge deleted", description: "1 edge removed" }); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98]">Delete Edge</button>
                    </>
                  )}
                  {advancedModeEnabled && (
                    <>
                      <div className="my-1 h-px bg-border/40" />
                      <button onClick={() => { useGraphStore.getState().showAll(); toast({ title: "Unhid all nodes", description: `${hiddenCount} node${hiddenCount === 1 ? "" : "s"} restored` }); close(); }} disabled={hiddenCount === 0} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Show All</button>
                      <div className="my-1 h-px bg-border/40" />
                      <button onClick={() => { const clip = useGraphStore.getState().clipboard; if (clip && clip.nodeIds.length > 0) { useGraphStore.getState().setPastePosition(useGraphStore.getState().mousePosition); useGraphStore.getState().pasteFromClipboard(); toast({ title: "Pasted", description: `${clip.nodeIds.length} item${clip.nodeIds.length === 1 ? "" : "s"} pasted` }); } close(); }} disabled={!useGraphStore.getState().clipboard} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Paste</button>
                    </>
                  )}
                  <div className="my-1 h-px bg-border/40" />
                  <button onClick={() => { useGraphStore.getState().reset(); toast({ title: "Canvas cleared", description: `${allNodes.length} node${allNodes.length === 1 ? "" : "s"} removed` }); close(); }} disabled={allNodes.length === 0} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Clear Canvas</button>
                </>
              )}
            </div>
          </>
        );
      })()}
      <KeyboardShortcuts />
    </div>
  );
}

interface GraphCanvasProps {
  onOpenImport: () => void;
  onLoadSample: () => void;
}

export function GraphCanvas({ onOpenImport, onLoadSample }: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
    </ReactFlowProvider>
  );
}
