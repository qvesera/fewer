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

import { CustomNode } from "./CustomNode";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { useGraphStore } from "@/store/graphStore";
import { useTheme } from "next-themes";
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStyle } from "@/lib/graphir/types";

const nodeTypes: NodeTypes = {
  folder: CustomNode,
  file: CustomNode,
};

/** Map our edge style enum to React Flow edge type strings. */
function edgeTypeFor(style: EdgeStyle): string {
  switch (style) {
    case "curved":
      return "default";
    case "angled":
      return "smoothstep";
    case "straight":
      return "straight";
  }
}

interface CanvasMenuPosition {
  x: number;
  y: number;
}

function CanvasInner() {
  // Select raw arrays + hiddenIds from our Zustand store
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const direction = useGraphStore((s) => s.direction);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const commitHistory = useGraphStore((s) => s.commitHistory);
  const connectNodes = useGraphStore((s) => s.connectNodes);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const { toast } = useToast();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuPosition | null>(null);

  // Derive visible nodes/edges (filter out hidden)
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

  // Use React Flow's built-in state hooks for local rendering.
  // Sync from the Zustand store whenever the store's visible data changes.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(visibleNodes);
  const [rfEdges, setRfEdges] = useEdgesState(visibleEdges);

  // Sync store -> React Flow state when store changes (new graph loaded, relayout, etc.)
  useEffect(() => {
    setRfNodes(visibleNodes);
  }, [visibleNodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(visibleEdges);
  }, [visibleEdges, setRfEdges]);

  // Debug
  useEffect(() => {
    console.log("[GraphCanvas] rfNodes:", rfNodes.length, "rfEdges:", rfEdges.length);
  }, [rfNodes.length, rfEdges.length]);

  const { fitView, zoomIn, zoomOut, getNodes, screenToFlowPosition } = useReactFlow();

  // Re-fit the view whenever the layout direction changes so the user
  // actually sees the repositioned graph.
  useEffect(() => {
    if (rfNodes.length === 0) return;
    const t = setTimeout(() => {
      fitView({ duration: 500, padding: 0.2, maxZoom: 1.0 });
    }, 80);
    return () => clearTimeout(t);
  }, [direction, rfNodes.length, fitView]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setSelectedNodeIds(selected.map((n) => n.id));
    },
    [setSelectedNodeIds]
  );

  /**
   * Handle node changes from React Flow. Use the built-in handler from
   * useNodesState (which updates rfNodes), then sync position changes back
   * to our Zustand store for undo/redo.
   */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      // Sync position changes back to store (for undo/redo persistence)
      const positionChanges = changes.filter(
        (c): c is NodeChange & { id: string; position: { x: number; y: number } } =>
          c.type === "position" && !!c.position
      );
      if (positionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = positionChanges.find((c) => c.id === n.id);
            return change ? { ...n, position: change.position } : n;
          }),
        }));
      }
    },
    [onNodesChange]
  );

  /**
   * Validate + create an edge when the user drag-connects two handles.
   */
  const onConnect = useCallback(
    (connection: Connection) => {
      const result = connectNodes(connection);
      if (!result.ok) {
        toast({
          title: "Connection rejected",
          description: result.reason,
          variant: "destructive",
        });
      } else {
        // Also add to React Flow's local edge state
        if (connection.source && connection.target) {
          const newEdge = {
            id: `e-${connection.source}-${connection.target}-${Date.now()}`,
            source: connection.source,
            target: connection.target,
            type: "default" as const,
          };
          setRfEdges((eds) => [...eds, newEdge]);
        }
      }
    },
    [connectNodes, toast, setRfEdges]
  );

  /**
   * Drop a folder child entry onto the canvas to create a new standalone
   * child node. The dragged payload is set in CustomNode's ChildEntry.
   */
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const payload = event.dataTransfer.getData("application/graphir-child");
      if (!payload) return;
      try {
        const { label, type } = JSON.parse(payload);
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addStandaloneNode(label, type, position);
        toast({
          title: "Node created",
          description: `"${label}" dropped onto canvas`,
        });
      } catch {
        // ignore malformed payload
      }
    },
    [screenToFlowPosition, addStandaloneNode, toast]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  /**
   * When a drag finishes, take a single snapshot for undo/redo.
   */
  const onNodeDragStop = useCallback(() => {
    commitHistory();
  }, [commitHistory]);

  /**
   * When a multi-select drag finishes, also commit.
   */
  const onSelectionDragStop = useCallback(() => {
    commitHistory();
  }, [commitHistory]);

  const fitToSelection = useCallback(() => {
    const selected = getNodes().filter((n) => n.selected);
    if (selected.length === 0) {
      fitView({ duration: 600, padding: 0.2 });
      return;
    }
    fitView({
      nodes: selected.map((n) => ({ id: n.id })),
      duration: 600,
      padding: 0.3,
    });
  }, [fitView, getNodes]);

  const selectAll = useCallback(() => {
    useGraphStore.setState((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: true })),
      selectedNodeIds: s.nodes.map((n) => n.id),
    }));
  }, []);

  const isDark = theme === "dark";

  const minimapStyle = useMemo(
    () => ({
      backgroundColor: isDark ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.6)",
      borderRadius: "12px",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.1)"}`,
    }),
    [isDark]
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onContextMenu={(e) => {
        // Only show the custom canvas menu when right-clicking on empty canvas
        // (not on nodes — nodes have their own context menus).
        const target = e.target as HTMLElement;
        if (target.closest(".react-flow__node")) return;
        e.preventDefault();
        setCanvasMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onDelete={({ nodes: deletedNodes }) => deleteNodes(deletedNodes.map((n) => n.id))}
        onInit={(instance) => {
          console.log("[ReactFlow] onInit - edges:", instance.getEdges().length, "nodes:", instance.getNodes().length);
        }}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        onlyRenderVisibleElements={false}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }}
        minZoom={0.15}
        maxZoom={3}
        defaultEdgeOptions={{
          type: edgeTypeFor(edgeStyle),
          style: {
            stroke: isDark ? "rgba(148, 163, 184, 0.55)" : "rgba(71, 85, 105, 0.6)",
            strokeWidth: 2,
          },
        }}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent h-full w-full"
      >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.5}
                color={isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(71, 85, 105, 0.2)"}
                className="transition-colors"
              />
              <Controls
                className="!rounded-xl !border !border-border/40 !bg-card/80 !shadow-xl backdrop-blur-md"
                showInteractive={false}
              />
              <MiniMap
                style={minimapStyle}
                pannable
                zoomable
                nodeColor={(n) =>
                  n.data?.type === "folder"
                    ? "rgba(249, 115, 22, 0.7)"
                    : "rgba(168, 85, 247, 0.7)"
                }
                nodeStrokeWidth={2}
                ariaLabel="Mini map"
              />

              <Panel position="bottom-center">
                <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-card/80 p-1 shadow-xl backdrop-blur-md">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => zoomIn({ duration: 250 })}
                    title="Zoom in (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => zoomOut({ duration: 250 })}
                    title="Zoom out (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fitView({ duration: 600, padding: 0.2 })}
                    title="Fit view (Space)"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={fitToSelection}
                    title="Zoom to selection"
                  >
                    <Crosshair className="h-4 w-4" />
                  </Button>
                </div>
              </Panel>

              {rfNodes.length === 0 && (
                <Panel position="top-center" className="!top-1/3">
                  <div
                    className={cn(
                      "flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-card/80 px-8 py-6 text-center shadow-2xl backdrop-blur-xl"
                    )}
                  >
                    <div className="text-5xl">📁</div>
                    <div className="text-lg font-semibold">No directory loaded</div>
                    <div className="max-w-xs text-sm text-muted-foreground">
                      Use the sidebar to open a directory from your file system, or load one
                      of the sample datasets to explore the visualization.
                    </div>
                  </div>
                </Panel>
              )}

              {hiddenCount > 0 && (
                <Panel position="top-right">
                  <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 shadow-lg backdrop-blur-md">
                    {hiddenCount} node{hiddenCount === 1 ? "" : "s"} hidden
                  </div>
                </Panel>
              )}
      </ReactFlow>

      {/* Canvas context menu (custom, positioned at cursor) */}
      {canvasMenu && (
        <>
          {/* Click-away overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCanvasMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCanvasMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-[200px] rounded-xl border border-border/40 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl"
            style={{ left: canvasMenu.x, top: canvasMenu.y }}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Canvas actions
            </div>
            <div className="my-1 h-px bg-border/40" />
            <button
              onClick={() => { fitView({ duration: 500, padding: 0.2 }); setCanvasMenu(null); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              Fit View
            </button>
            <button
              onClick={() => { selectAll(); setCanvasMenu(null); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              Select All
            </button>
            <button
              onClick={() => { zoomIn({ duration: 250 }); setCanvasMenu(null); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              Zoom In
            </button>
            <button
              onClick={() => { zoomOut({ duration: 250 }); setCanvasMenu(null); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              Zoom Out
            </button>
            <div className="my-1 h-px bg-border/40" />
            <button
              onClick={() => {
                useGraphStore.getState().unhideAll();
                toast({
                  title: "Unhid all nodes",
                  description: `${hiddenCount} node${hiddenCount === 1 ? "" : "s"} restored`,
                });
                setCanvasMenu(null);
              }}
              disabled={hiddenCount === 0}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Unhide All Nodes
            </button>
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
