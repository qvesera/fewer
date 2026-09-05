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
import { applyEdgeSelection, buildSelectedEdgeHighlight } from "@/lib/fewer/edgeHighlight";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, Maximize2, Crosshair, FolderOpen, Sparkles, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStyle, EdgeStrokeStyle, FewerEdge, FewerNode } from "@/lib/fewer/types";
import type { OnSelectionChangeParams } from "@xyflow/react";
import { useGraphStore } from "@/store/graphStore";
import { FEWER_ADD_NODE, FEWER_ADD_NODE_PARENT } from "@/lib/fewer/keyboardShortcuts";

// Hooks (Phase C extraction — each is a cohesive, single-concern unit).
import { useCanvasResize } from "@/hooks/use-canvas-resize";
import { useCanvasThemeColors, type CanvasThemeColors } from "@/hooks/use-canvas-theme-colors";
import { useCanvasVisibleGraph } from "@/hooks/use-canvas-visible-graph";
import { useCanvasGraphSync } from "@/hooks/use-canvas-graph-sync";
import { useCanvasDashClock } from "@/hooks/use-canvas-dash-clock";
import { useCanvasDirectionRemeasure } from "@/hooks/use-canvas-direction-remeasure";
import { useCanvasInitialFit } from "@/hooks/use-canvas-initial-fit";
import { layoutGraphContour } from "@/lib/fewer/layout";
import { useCanvasZoomToNode } from "@/hooks/use-canvas-zoom-to-node";
import { useCanvasMinimap } from "@/hooks/use-canvas-minimap";
import { useCanvasNodeDrag } from "@/hooks/use-canvas-node-drag";
import { useCanvasNodeChangeHandler } from "@/hooks/use-canvas-node-change-handler";
import { useCanvasBoxSelect } from "@/hooks/use-canvas-box-select";
import { useCanvasDrop } from "@/hooks/use-canvas-drop";
import { useCanvasCtrlWheelPan } from "@/hooks/use-canvas-ctrl-wheel-pan";
import { resolveViewSettings } from "@/lib/fewer/viewState";
import { GraphViewProvider } from "@/hooks/use-graph-view-context";

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
interface CanvasEmptyActionsProps { onOpenImport: () => void; onLoadSample: () => void; primary?: boolean; leafId?: string; }

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
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const showFilesGlobal = useGraphStore((s) => s.showFiles);
  const viewSettingsMap = useGraphStore((s) => s.viewSettings);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const edgeStyleGlobal = useGraphStore((s) => s.edgeStyle);
  const edgeAnimatedGlobal = useGraphStore((s) => s.edgeAnimated);
  const edgeAnimatedSelectedOnlyGlobal = useGraphStore((s) => s.edgeAnimatedSelectedOnly);
  const edgeStrokeStyleGlobal = useGraphStore((s) => s.edgeStrokeStyle);
  const edgeAnimatedStrokeStyle = useGraphStore((s) => s.edgeAnimatedStrokeStyle);
  const edgeWidthGlobal = useGraphStore((s) => s.edgeWidth);
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
  const themeModeGlobal = useGraphStore((s) => s.themeMode);
  const customTheme = useGraphStore((s) => s.customTheme);
  const direction = useGraphStore((s) => s.direction);
  const hoverHighlightIds = useGraphStore((s) => s.hoverHighlightIds);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const setZoomToNodeIds = useGraphStore((s) => s.setZoomToNodeIds);
  const graphVersion = useGraphStore((s) => s.graphVersion);
  const relayout = useGraphStore((s) => s.relayout);

  // ── Resolve per-view settings ──
  const vs = useMemo(
    () => resolveViewSettings(viewSettingsMap, leafId, {
      showFiles: showFilesGlobal, minimapHidden: false,
      edgeStyle: edgeStyleGlobal, edgeAnimated: edgeAnimatedGlobal,
      edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal,
      edgeStrokeStyle: edgeStrokeStyleGlobal, edgeWidth: edgeWidthGlobal,
      themeMode: themeModeGlobal, direction, hiddenIds,
    }, hiddenIds),
    [viewSettingsMap, leafId, showFilesGlobal, edgeStyleGlobal, edgeAnimatedGlobal, edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyleGlobal, edgeWidthGlobal, themeModeGlobal, direction, hiddenIds],
  );

  const isDark = vs.themeMode === "dark";

  // ── Hook extractions ──
  useCanvasResize(containerRef, setCanvasSize);
  const themeColors = useCanvasThemeColors(vs.themeMode, isDark, customTheme);

  // Derive effective hiddenIds: if per-leaf showFiles is off, add all file node IDs
  const effectiveHiddenIds = vs.showFiles
    ? hiddenIds
    : [...hiddenIds, ...allNodes.filter((n) => n.data.type === "file").map((n) => n.id)];

  const { visibleNodes, visibleEdges, hiddenCount } = useCanvasVisibleGraph(allNodes, allEdges, effectiveHiddenIds);

  // ── Per-view direction: derive positions when direction override is active ──
  const hasDirectionOverride = vs.direction !== direction;
  const positionedNodes = useMemo(() => {
    // 1. Explicit per-view positions (set by drag) take priority
    if (vs.positions) {
      return visibleNodes.map((n) => vs.positions![n.id] ? { ...n, position: vs.positions![n.id] } : n);
    }
    // 2. Direction override without explicit positions: derive from layout engine
    if (hasDirectionOverride) {
      return layoutGraphContour(visibleNodes, visibleEdges, vs.direction);
    }
    // 3. No override: use shared (store) positions
    return visibleNodes;
  }, [vs.positions, vs.direction, hasDirectionOverride, visibleNodes, visibleEdges]);

  const graphsExists = allNodes.length > 0;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(visibleNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(visibleEdges);

  // Track RF's live edge-selection so rebuilds (highlight/sync) don't wipe it.
  const selectedEdgeIdsRef = useRef<Set<string>>(new Set());
  // Protect double-click selection from being cleared by the subsequent onSelectionChange.
  const doubleClickedIdRef = useRef<string | null>(null);
  const handleEdgesChange = useCallback(
    (changes: import("@xyflow/react").EdgeChange<FewerEdge>[]) => {
      for (const c of changes) {
        if (c.type === "select") {
          if (c.selected) selectedEdgeIdsRef.current.add(c.id);
          else selectedEdgeIdsRef.current.delete(c.id);
        } else if (c.type === "remove") {
          selectedEdgeIdsRef.current.delete(c.id);
        }
        // `add` changes carry no id (the edge is the payload) — nothing to track.
      }
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  useCanvasGraphSync(graphVersion, positionedNodes, visibleEdges, setRfNodes, setRfEdges, leafId);
  useCanvasDashClock(advancedModeEnabled, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly);
  useCanvasDirectionRemeasure(vs.direction);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition, setViewport, getViewport, getEdges } = useReactFlow();
  useCanvasInitialFit(positionedNodes, containerRef, setViewport);
  const zoomToNode = useGraphStore((s) => s.zoomToNode);
  useCanvasZoomToNode(zoomToNode, useGraphStore((s) => s.zoomToNodeIds), fitView, setZoomToNodeIds);
  const mini = useCanvasMinimap({ themeColors, isDark, leafId });
  // When a direction override is active, drag writes per-view positions
  const setNodePositionForLeaf = useGraphStore((s) => s.setNodePositionForLeaf);
  const effectiveRecordDragMoves = useCallback(
    (moves: { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } }[]) => {
      if (leafId && hasDirectionOverride) {
        for (const m of moves) setNodePositionForLeaf(leafId, m.nodeId, m.to);
      } else {
        recordDragMoves(moves);
      }
    },
    [leafId, hasDirectionOverride, recordDragMoves, setNodePositionForLeaf],
  );
  const dragHandlers = useCanvasNodeDrag(effectiveRecordDragMoves);
  const { baseRef: boxSelectBaseRef, onPointerDownCapture, onPointerUp, onPointerCancel } = useCanvasBoxSelect({ selectedNodeIds, setRfNodes });
  const handleNodesChange = useCanvasNodeChangeHandler({ onNodesChange, fitView, recordResize, boxSelectBaseRef });
  const { onDrop, onDragOver } = useCanvasDrop({ screenToFlowPosition, addStandaloneNode, toast });
  useCanvasCtrlWheelPan(containerRef, mini.scrollAction === "zoom");

  const animation = useEdgeAnimationOpts(advancedModeEnabled, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, vs.edgeStrokeStyle);
  // ── Re-apply edge highlight on graph/theme/edge changes (see useEdgeHighlight). ──
  // Store edges are read via getState() so the effect only fires when selection /
  // theme / animation / hiddenIds / graphVersion change — NOT when store edges
  // change from the effect itself, which would create a render loop.
  useEffect(() => {
    const latestEdges = useGraphStore.getState().edges;
    const updatedEdges = buildSelectedEdgeHighlight(selectedNodeIds, hoverHighlightIds, latestEdges, allNodes, themeColors, vs.edgeWidth, animation);
    // Apply per-view edge type (curved/straight/angled) to RF-state edges
    const rfEdges = updatedEdges.map((e) => ({ ...e, type: edgeTypeFor(vs.edgeStyle) }));
    // Sync store edges so persistence / undo / export reflect the current highlight.
    useGraphStore.setState({ edges: updatedEdges });
    // Re-apply RF's live edge selection so the rebuild doesn't wipe it.
    setRfEdges(applyEdgeSelection(rfEdges, selectedEdgeIdsRef.current).filter((e: FewerEdge) => {
      const hidden = new Set(hiddenIds);
      return !hidden.has(e.source) && !hidden.has(e.target);
    }));
  }, [selectedNodeIds, hoverHighlightIds, allNodes, themeColors, vs.edgeWidth, vs.edgeStyle, graphVersion, advancedModeEnabled, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, vs.edgeStrokeStyle, animation, setRfEdges, hiddenIds]);

  const dashArray = useMemo(() => {
    switch (vs.edgeStrokeStyle) {
      case "dashed": return "6 6";
      case "dotted": return "2 6";
      case "solid":
      default: return undefined;
    }
  }, [vs.edgeStrokeStyle]);

  const [canvasMenu, setCanvasMenu] = useState<(CanvasMenuPosition & { kind: "pane" | "edge" | "selection" }) | null>(null);
  const [lastClickedEdgeId, setLastClickedEdgeId] = useState<string | null>(null);

  // ── Selection: highlight ancestor path for EVERY selected node ──
  const onSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: OnSelectionChangeParams) => {
            const selectedIds = new Set(selected.map((n) => n.id));
      // If a double-click just selected a node, ensure it stays selected
      // even if RF's onSelectionChange reports a stale/empty selection.
      if (doubleClickedIdRef.current) {
        selectedIds.add(doubleClickedIdRef.current);
        doubleClickedIdRef.current = null;
      }
      // Sync the live edge-selection ref from RF's authoritative full-selection
      // snapshot so the upcoming rebuild (and any later one) preserves it.
      selectedEdgeIdsRef.current = new Set(selectedEdges.filter((e) => e.selected).map((e) => e.id));
      const prevIds = useGraphStore.getState().selectedNodeIds;
      const base = boxSelectBaseRef.current;
      const newIds = base
        ? [...new Set([...base, ...selectedIds])]
        : [
            ...prevIds.filter((id: string) => selectedIds.has(id)),
                        ...selected.filter((n) => !prevIds.includes(n.id)).map((n) => n.id),
          ];
      // Write to per-leaf selection (and global for keyboard shortcut compatibility)
      if (leafId) {
        useGraphStore.getState().setSelectionForLeaf(leafId, newIds);
      } else {
        setSelectedNodeIds(newIds);
      }

      // NOTE: we intentionally do NOT write store edges here. Writing edges
      // would change `allEdges` in the store, re-triggering the edge-highlight
      // effect below and causing an infinite onSelectionChange ↔ effect loop.
      // The effect handles both RF-edge highlighting and store-edge sync on
      // every selection / graphVersion / theme change.
    },
    [setSelectedNodeIds, setRfEdges, vs.edgeWidth, themeColors, advancedModeEnabled, boxSelectBaseRef, leafId],
  );

  const onConnect = useCallback(
    (connection) => {
      const result = connectNodes(connection);
      if (!result.ok) {
        toast({ title: "Connection rejected", description: result.reason, variant: "destructive" });
      } else if (connection.source && connection.target) {
        setRfEdges((eds) => [...eds, { id: `e-${connection.source}-${connection.target}-${Date.now()}`, source: connection.source, target: connection.target, type: edgeTypeFor(vs.edgeStyle) }]);
      }
    },
    [connectNodes, toast, setRfEdges, vs.edgeStyle],
  );

  const onConnectEnd = useCallback(
    (_: unknown, connectionState: { isValid: boolean | null; fromNode?: { id: string; data?: { type?: string } }; fromHandle?: { type?: "source" | "target" } }) => {
      if (!connectionState.isValid && connectionState.fromNode) {
        const store = useGraphStore.getState();
        store.setSelectedNodeIds([connectionState.fromNode.id]);
        if (connectionState.fromHandle?.type === "target") {
          // Dragging out of a node's entry handle → create a parent folder for it.
          window.dispatchEvent(new CustomEvent(FEWER_ADD_NODE_PARENT));
        } else if (connectionState.fromNode.data?.type === "folder") {
          window.dispatchEvent(new CustomEvent(FEWER_ADD_NODE));
        }
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
    <GraphViewProvider value={vs.direction}>
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
        onPaneClick={() => { setRenamingId(null); if (leafId) useGraphStore.getState().setActiveLeaf(leafId); }}
        onNodeDragStart={dragHandlers.onNodeDragStart} onNodeDragStop={dragHandlers.onNodeDragStop}
        onSelectionDragStart={dragHandlers.onSelectionDragStart} onSelectionDragStop={dragHandlers.onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={(_, node) => {
          doubleClickedIdRef.current = node.id;
          useGraphStore.getState().setSelectedNodeIds([node.id]);
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
        onPaneContextMenu={(e) => { e.preventDefault(); const mouseEvent = e as unknown as MouseEvent; setCanvasMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, kind: "pane" }); setLastClickedEdgeId(null); useGraphStore.getState().setRightClickDetected(); if (leafId) useGraphStore.getState().setActiveLeaf(leafId); }}
        onSelectionContextMenu={(e) => { e.preventDefault(); setCanvasMenu({ x: e.clientX, y: e.clientY, kind: "selection" }); setLastClickedEdgeId(null); useGraphStore.getState().setRightClickDetected(); }}
        onMouseMove={(e) => { const point = screenToFlowPosition({ x: e.clientX, y: e.clientY }); useGraphStore.getState().setMousePosition({ x: point.x, y: point.y }); }}
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
                {vs.showFiles
                  ? "All nodes on this graph are currently hidden on the canvas."
                  : "This graph is made only of files and \"Show Files\" is off, so nothing is displayed."}
              </div>
              {!vs.showFiles && (
                <Button variant="outline" onClick={() => leafId ? useGraphStore.getState().setViewSetting(leafId, "showFiles", true) : useGraphStore.getState().setShowFiles(true)} data-tutorial="show-files-button">
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
                  {leafId && (
                    <>
                      <button onClick={() => { useGraphStore.getState().toggleMinimapForLeaf(leafId); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]">{vs.minimapHidden ? "Show Minimap" : "Hide Minimap"}</button>
                      <button onClick={() => { useGraphStore.getState().setViewSetting(leafId, "showFiles", !vs.showFiles); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]">{vs.showFiles ? "Hide Files" : "Show Files"}</button>
                    </>
                  )}
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
