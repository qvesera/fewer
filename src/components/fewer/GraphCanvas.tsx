"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type OnSelectionChangeParams,
  type NodeChange,
  type Connection,
  Panel,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CustomNode, KeyboardShortcuts } from ".";
import { useGraphStore } from "@/store/graphStore";
import { ZoomIn, ZoomOut, Maximize2, Crosshair, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStyle, EdgeStrokeStyle, FewerEdge, FewerNode } from "@/lib/fewer/types";

const nodeTypes: NodeTypes = {
  folder: CustomNode,
  file: CustomNode,
};

function edgeTypeFor(style: EdgeStyle): FewerEdge["type"] {
  switch (style) {
    case "curved": return "default";
    case "angled": return "smoothstep";
    case "straight": return "straight";
  }
}

/** Read a CSS variable from :root (falling back to the bare var name). */
function cssVar(name: string, fallback = ""): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface CanvasMenuPosition {
  x: number;
  y: number;
}

function CanvasInner() {
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const direction = useGraphStore((s) => s.direction);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const edgeAnimated = useGraphStore((s) => s.edgeAnimated);
  const edgeStrokeStyle = useGraphStore((s) => s.edgeStrokeStyle);
  const edgeWidth = useGraphStore((s) => s.edgeWidth);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const commitHistory = useGraphStore((s) => s.commitHistory);
  const connectNodes = useGraphStore((s) => s.connectNodes);
  const loading = useGraphStore((s) => s.loading);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const themeMode = useGraphStore((s) => s.themeMode);
  const customTheme = useGraphStore((s) => s.customTheme);
  const isDark = themeMode === "dark";

  // Resolve theme colors once per theme change so edges, minimap, and the
  // background dots follow light/dark/custom without hard-coded values.
  const themeColors = useMemo(() => {
    const edge = cssVar("--fewer-edge", isDark ? "rgba(173, 181, 189, 0.5)" : "rgba(100, 116, 139, 0.4)");
    const folderBg = cssVar("--fewer-folder-bg", "rgba(253, 126, 20, 0.12)");
    const fileBg = cssVar("--fewer-file-bg", "rgba(190, 75, 219, 0.18)");
    const folderIcon = cssVar("--fewer-folder-icon", "#ffa94d");
    const fileIcon = cssVar("--fewer-file-icon", "#e599f7");
    const bgDot = isDark ? "rgba(173, 181, 189, 0.18)" : "rgba(100, 116, 139, 0.2)";
    return { edge, folderBg, fileBg, folderIcon, fileIcon, bgDot };
  }, [themeMode, isDark, customTheme]);

  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuPosition | null>(null);
  const [lastClickedEdgeId, setLastClickedEdgeId] = useState<string | null>(null);

  const dashArray = useMemo(() => {
    switch (edgeStrokeStyle) {
      case "dashed": return "6 6";
      case "dotted": return "2 6";
      case "solid":
      default: return undefined;
    }
  }, [edgeStrokeStyle]);

  const visibleNodes = useMemo(() => {
    if (hiddenIds.length === 0) return allNodes;
    const hidden = new Set(hiddenIds);
    return allNodes.filter((n) => !hidden.has(n.id));
  }, [allNodes, hiddenIds]);

  const visibleEdges = useMemo(() => {
    if (hiddenIds.length === 0) return allEdges;
    const hidden = new Set(hiddenIds);
    return allEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target));
  }, [allEdges, hiddenIds]);

  const hiddenCount = hiddenIds.length;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(visibleNodes);
  const [rfEdges, setRfEdges] = useEdgesState(visibleEdges);

  const graphVersion = useGraphStore((s) => s.graphVersion);
  const prevGraphVersion = useRef(graphVersion);
  useEffect(() => {
    if (graphVersion !== prevGraphVersion.current) {
      setRfNodes(visibleNodes);
      setRfEdges(visibleEdges);
      prevGraphVersion.current = graphVersion;
    }
  }, [graphVersion, visibleNodes, visibleEdges, setRfNodes, setRfEdges]);

  const { fitView, zoomIn, zoomOut, getNodes, screenToFlowPosition } = useReactFlow();

  const relayout = useGraphStore((s) => s.relayout);
  const hasMeasuredRef = useRef(false);
  const zoomToNode = useGraphStore((s) => s.zoomToNode);
  const zoomToNodeIds = useGraphStore((s) => s.zoomToNodeIds);

  useEffect(() => {
    if (!zoomToNode) return;
    const { nodeId } = zoomToNode;
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3, maxZoom: 1.5 });
    }, 150);
    return () => clearTimeout(t);
  }, [zoomToNode, fitView]);

  const zoomToNodeIdsRef = useRef(zoomToNodeIds);
  useEffect(() => { zoomToNodeIdsRef.current = zoomToNodeIds; }, [zoomToNodeIds]);

  useEffect(() => {
    const ids = zoomToNodeIdsRef.current;
    if (ids && ids.length > 0) {
      const t = setTimeout(() => {
        fitView({ nodes: ids.map((id) => ({ id })), duration: 600, padding: 0.3, maxZoom: 1.5 });
        useGraphStore.getState().setZoomToNodeIds(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [zoomToNodeIds]);

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (rfNodes.length === 0) return;
    if (!didInitialFit.current) { didInitialFit.current = true; return; }
    const t = setTimeout(() => {
      if (useGraphStore.getState().zoomToNode) return;
      fitView({ duration: 500, padding: 0.2, maxZoom: 1.0 });
    }, 200);
    return () => clearTimeout(t);
  }, [direction, graphVersion, fitView]);

  // ── Re-apply edge colors when theme changes ──
  useEffect(() => {
    const selectedIds = useGraphStore.getState().selectedNodeIds;
    const defaultStroke = themeColors.edge;
    if (selectedIds.length === 0) {
      // No selection: reset edges to default colors
      const edges = useGraphStore.getState().edges;
      const resetEdges = edges.map((e) => ({ ...e, style: { ...e.style, stroke: defaultStroke, strokeWidth: edgeWidth } }));
      useGraphStore.setState({ edges: resetEdges });
      const hidden = new Set(useGraphStore.getState().hiddenIds);
      setRfEdges(resetEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)));
      return;
    }
    // Re-highlight the ancestor path with the new theme colors
    const focusId = selectedIds[selectedIds.length - 1];
    const edges = useGraphStore.getState().edges;
    const parentMap = new Map<string, string>();
    for (const e of edges) parentMap.set(e.target, e.source);
    const pathEdges = new Set<string>();
    let currentId: string | undefined = focusId;
    while (currentId && parentMap.has(currentId)) {
      const parentId = parentMap.get(currentId)!;
      const edgeId = edges.find((e) => e.source === parentId && e.target === currentId)?.id;
      if (edgeId) pathEdges.add(edgeId);
      currentId = parentId;
    }
    const focusNode = useGraphStore.getState().nodes.find((n) => n.id === focusId);
    const accentColor = focusNode?.data.type === "folder" ? themeColors.folderIcon : themeColors.fileIcon;
    const updatedEdges = edges.map((e) => {
      if (pathEdges.has(e.id)) return { ...e, style: { ...e.style, stroke: accentColor, strokeWidth: Math.max(edgeWidth, 3) } };
      return { ...e, style: { ...e.style, stroke: defaultStroke, strokeWidth: edgeWidth } };
    });
    updatedEdges.sort((a) => (pathEdges.has(a.id) ? 1 : -1));
    useGraphStore.setState({ edges: updatedEdges });
    const hidden = new Set(useGraphStore.getState().hiddenIds);
    setRfEdges(updatedEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)));
  }, [themeMode, setRfEdges, edgeWidth, themeColors]);

  // ── Selection: highlight ancestor path ──
  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      const selectedIds = new Set(selected.map((n) => n.id));
      const prevIds = useGraphStore.getState().selectedNodeIds;
      const kept = prevIds.filter((id) => selectedIds.has(id));
      const added = selected.filter((n) => !prevIds.includes(n.id)).map((n) => n.id);
      const newIds = [...kept, ...added];
      setSelectedNodeIds(newIds);

      const edges = useGraphStore.getState().edges;
      const parentMap = new Map<string, string>();
      for (const e of edges) parentMap.set(e.target, e.source);

      const focusId = newIds.length > 0 ? newIds[newIds.length - 1] : null;
      const pathEdges = new Set<string>();
      if (focusId) {
        let currentId: string | undefined = focusId;
        while (currentId && parentMap.has(currentId)) {
          const parentId = parentMap.get(currentId)!;
          const edgeId = edges.find((e) => e.source === parentId && e.target === currentId)?.id;
          if (edgeId) pathEdges.add(edgeId);
          currentId = parentId;
        }
      }

      const defaultStroke = themeColors.edge;
      const focusSel = selected.find((n) => n.id === focusId);
      const accentColor = focusSel?.data?.type === "folder" ? themeColors.folderIcon : themeColors.fileIcon;
      const updatedEdges = edges.map((e) => {
        if (pathEdges.has(e.id)) {
          return { ...e, style: { ...e.style, stroke: accentColor, strokeWidth: Math.max(edgeWidth, 3) } };
        }
        return { ...e, style: { ...e.style, stroke: defaultStroke, strokeWidth: edgeWidth } };
      });
      // Sort: highlighted edges last so they render on top
      updatedEdges.sort((a) => (pathEdges.has(a.id) ? 1 : -1));
      useGraphStore.setState({ edges: updatedEdges });
      const hidden = new Set(useGraphStore.getState().hiddenIds);
      setRfEdges(updatedEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)));
    },
    [setSelectedNodeIds, setRfEdges, edgeWidth, themeColors],
  );

  // ── Handle node changes (position/dimension) ──
  const handleNodesChange = useCallback(
    (changes: NodeChange<FewerNode>[]) => {
      onNodesChange(changes);

      const dimensionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; dimensions: { width: number; height: number } } =>
          c.type === "dimensions" && !!c.dimensions,
      );
      const positionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; position: { x: number; y: number } } =>
          c.type === "position" && !!c.position,
      );

      if (positionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = positionChanges.find((c) => c.id === n.id);
            return change ? { ...n, position: change.position } : n;
          }),
        }));
      }

      if (dimensionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = dimensionChanges.find((c) => c.id === n.id);
            if (change) {
              return {
                ...n,
                style: { ...n.style, width: change.dimensions.width, height: n.data.type === "folder" ? change.dimensions.height : n.style?.height },
                measured: { width: change.dimensions.width, height: change.dimensions.height },
              };
            }
            return n;
          }),
        }));

        if (!hasMeasuredRef.current) {
          hasMeasuredRef.current = true;
          setTimeout(() => { relayout(); fitView({ duration: 400, padding: 0.2, maxZoom: 1.0 }); }, 50);
        }
      }
    },
    [onNodesChange, relayout, fitView],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = connectNodes(connection);
      if (!result.ok) {
        toast({ title: "Connection rejected", description: result.reason, variant: "destructive" });
      } else if (connection.source && connection.target) {
        setRfEdges((eds) => [...eds, { id: `e-${connection.source}-${connection.target}-${Date.now()}`, source: connection.source, target: connection.target, type: edgeTypeFor(edgeStyle) }]);
      }
    },
    [connectNodes, toast, setRfEdges, edgeStyle],
  );

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      const payload = event.dataTransfer.getData("application/fewer-child");
      if (!payload) return;
      try {
        const { label, type, parentId } = JSON.parse(payload);
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const { draggedFolderHandle } = await import("./CustomNode");
        const handle = draggedFolderHandle as FileSystemDirectoryHandle | null;
        const { expandFolderNode } = await import("@/lib/fewer/fileOps");
        if (handle && handle.kind === "directory") {
          await expandFolderNode(label, parentId, position, handle, useGraphStore.getState() as any);
          toast({ title: "Folder expanded", description: `"${label}" and its contents loaded from disk` });
        } else {
          addStandaloneNode(label, type, position);
          toast({ title: "Node created", description: `"${label}" dropped onto canvas` });
        }
      } catch { /* ignore */ }
    },
    [screenToFlowPosition, addStandaloneNode, toast],
  );

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }, []);
  const onNodeDragStop = useCallback(() => { commitHistory(); }, [commitHistory]);
  const onSelectionDragStop = useCallback(() => { commitHistory(); }, [commitHistory]);

  const fitToSelection = useCallback(() => {
    const selected = useGraphStore.getState().selectedNodeIds;
    if (selected.length === 0) { fitView({ duration: 600, padding: 0.2 }); return; }
    fitView({ nodes: selected.map((id) => ({ id })), duration: 600, padding: 0.3 });
  }, [fitView]);

  const selectAll = useCallback(() => {
    useGraphStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })), selectedNodeIds: s.nodes.map((n) => n.id) }));
  }, []);

  const showMiniMap = useGraphStore((s) => s.showMiniMap);
  const miniMapPosition = useGraphStore((s) => s.miniMapPosition);
  const miniMapSize = useGraphStore((s) => s.miniMapSize);

  const minimapStyle = useMemo(() => ({
    width: miniMapSize, height: miniMapSize,
    backgroundColor: isDark ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.6)",
    borderRadius: "12px",
    border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.1)"}`,
  }), [isDark, miniMapSize]);

  // Compute a contrasting chip background from the canvas background color
  const hiddenChipStyle = useMemo(() => {
    const bg = cssVar("--fewer-background", "#0b0b13");
    const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim());
    if (!m) return {};
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    if (luminance > 128) {
      // Light canvas → dark chip with light text
      return { backgroundColor: `rgba(${Math.round(r * 0.25)}, ${Math.round(g * 0.25)}, ${Math.round(b * 0.25)}, 0.8)`, color: "rgba(255, 255, 255, 0.9)" };
    }
    // Dark canvas → light chip with dark text
    return { backgroundColor: `rgba(${Math.min(255, Math.round(r * 0.5 + 128))}, ${Math.min(255, Math.round(g * 0.5 + 128))}, ${Math.min(255, Math.round(b * 0.5 + 128))}, 0.8)`, color: "rgba(0, 0, 0, 0.85)" };
  }, [themeColors]);

  const nodeColor = useCallback(
    (n: FewerNode) => n.data?.type === "folder" ? themeColors.folderBg : themeColors.fileBg,
    [themeColors],
  );
  const nodeStrokeColor = useCallback(
    (n: FewerNode) => n.data?.type === "folder" ? themeColors.folderIcon : themeColors.fileIcon,
    [themeColors],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full" style={{ backgroundColor: "var(--fewer-background)" }} onDrop={onDrop} onDragOver={onDragOver}
      onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        key={`flow-${direction}`}
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange as import("@xyflow/react").OnNodesChange}
        onConnect={onConnect}
        onPaneClick={() => setRenamingId(null)}
        onNodeDragStop={onNodeDragStop} onSelectionDragStop={onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={(_, node) => {
          useGraphStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: n.id === node.id })), selectedNodeIds: [node.id] }));
          fitToSelection();
        }}
        onDelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
          if (deletedNodes.length > 0) {
            deleteNodes(deletedNodes.map((n) => n.id));
            toast({ title: "Deleted", description: `${deletedNodes.length} item${deletedNodes.length === 1 ? "" : "s"} removed` });
          }
          if (deletedEdges.length > 0) {
            useGraphStore.getState().deleteEdges(deletedEdges.map((e) => e.id));
            toast({ title: "Deleted", description: `${deletedEdges.length} edge${deletedEdges.length === 1 ? "" : "s"} removed` });
          }
        }}
        onInit={(instance) => { console.log("[ReactFlow] onInit - edges:", instance.getEdges().length, "nodes:", instance.getNodes().length); }}
        onNodeContextMenu={(event) => event.preventDefault()}
        onEdgeContextMenu={(event, edge) => { event.preventDefault(); setLastClickedEdgeId(edge.id); const rect = containerRef.current?.getBoundingClientRect(); if (rect) setCanvasMenu({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); }}
        onPaneContextMenu={(e) => { e.preventDefault(); const mouseEvent = e as unknown as MouseEvent; setCanvasMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY }); useGraphStore.getState().setRightClickDetected(); }}
        onMouseMove={(e) => { const point = screenToFlowPosition({ x: e.clientX, y: e.clientY }); useGraphStore.getState().setMousePosition({ x: point.x, y: point.y }); }}
        nodesDraggable nodesConnectable elementsSelectable
        onlyRenderVisibleElements
        fitView fitViewOptions={{ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }}
        minZoom={0.15} maxZoom={3}
        defaultEdgeOptions={{
          type: edgeTypeFor(edgeStyle), animated: edgeAnimated,
          style: { stroke: themeColors.edge, strokeWidth: edgeWidth, ...(dashArray ? { strokeDasharray: dashArray } : {}) },
        }}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent h-full w-full"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5}
          color={themeColors.bgDot}
          className="transition-colors" />
        <Controls className="!rounded-xl !border !border-border/40 !bg-card/80 !shadow-xl backdrop-blur-md" showInteractive={false} />
        {showMiniMap && (
          <MiniMap position={miniMapPosition} style={minimapStyle} pannable zoomable
            nodeColor={nodeColor} nodeStrokeColor={nodeStrokeColor} nodeStrokeWidth={2} nodeBorderRadius={4} ariaLabel="Mini map" />
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
        {!loading && rfNodes.length === 0 && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <FolderOpen className="h-12 w-12 text-muted-foreground/60" />
              <div className="text-lg font-semibold">No directory loaded</div>
              <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">Use the sidebar to open a directory from your file system, or load one of the sample datasets to explore the visualization.</div>
            </div>
          </Panel>
        )}
        {hiddenCount > 0 && (
          <Panel position="top-right">
            <button className="rounded-full px-3 py-1.5 text-xs cursor-pointer transition-colors animate-in fade-in slide-in-from-right-2 duration-200 backdrop-blur-md"
              style={hiddenChipStyle}
              onClick={() => { useGraphStore.getState().setSidebarOpen(true); useGraphStore.getState().triggerHiddenPanelExpand(); }}>
              {hiddenCount} node{hiddenCount === 1 ? "" : "s"} hidden
            </button>
          </Panel>
        )}
      </ReactFlow>

      {canvasMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCanvasMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCanvasMenu(null); }} />
          <div className="gm-float fixed z-50 min-w-[200px] rounded-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150" style={{ left: canvasMenu.x, top: canvasMenu.y }}>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Canvas actions</div>
            <div className="my-1 h-px bg-border/40" />
            <button onClick={() => { fitView({ duration: 500, padding: 0.2 }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Fit View</button>
            <button onClick={() => { selectAll(); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Select All</button>
            <button onClick={() => { zoomIn({ duration: 250 }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Zoom In</button>
            <button onClick={() => { zoomOut({ duration: 250 }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]">Zoom Out</button>
            {(() => {
              const edgeId = lastClickedEdgeId;
              if (edgeId) return (
                <>
                  <div className="my-1 h-px bg-border/40" />
                  <button onClick={() => { useGraphStore.getState().deleteEdges([edgeId]); toast({ title: "Edge deleted", description: "1 edge removed" }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98]">Delete Edge</button>
                </>
              );
              return null;
            })()}
            {(() => {
              const ids = useGraphStore.getState().selectedNodeIds;
              if (ids.length >= 2) {
                const lastNode = useGraphStore.getState().nodes.find((n) => n.id === ids[ids.length - 1]);
                if (lastNode?.data.type === "folder") return (
                  <>
                    <div className="my-1 h-px bg-border/40" />
                    <button onClick={() => {
                      const state = useGraphStore.getState(); const parentId = ids[ids.length - 1]; const childIds = ids.slice(0, -1);
                      let ok = 0, fail = 0;
                      for (const childId of childIds) { const r = state.connectNodes({ source: parentId, target: childId } as Connection); if (r.ok) ok++; else fail++; }
                      toast({ title: "Nodes parented", description: `${ok} node${ok !== 1 ? "s" : ""} parented${fail > 0 ? `, ${fail} skipped` : ""}` });
                      setCanvasMenu(null);
                    }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98]">Set as Parent</button>
                  </>
                );
              }
              return null;
            })()}
            {advancedModeEnabled && (
              <>
                <div className="my-1 h-px bg-border/40" />
                <button onClick={() => { useGraphStore.getState().showAll(); toast({ title: "Unhid all nodes", description: `${hiddenCount} node${hiddenCount === 1 ? "" : "s"} restored` }); setCanvasMenu(null); }} disabled={hiddenCount === 0} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Show All Nodes</button>
                <div className="my-1 h-px bg-border/40" />
                <button onClick={() => { const clip = useGraphStore.getState().clipboard; if (clip && clip.nodeIds.length > 0) { useGraphStore.getState().setPastePosition(useGraphStore.getState().mousePosition); useGraphStore.getState().pasteFromClipboard(); toast({ title: "Pasted", description: `${clip.nodeIds.length} item${clip.nodeIds.length === 1 ? "" : "s"} pasted` }); } setCanvasMenu(null); }} disabled={!useGraphStore.getState().clipboard} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Paste</button>
              </>
            )}
          </div>
        </>
      )}
      <KeyboardShortcuts />
    </div>
  );
}

export function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}