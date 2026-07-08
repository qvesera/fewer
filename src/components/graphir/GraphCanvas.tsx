"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
  type OnSelectionChangeParams,
  type NodeChange,
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";

const nodeTypes: NodeTypes = {
  folder: CustomNode,
  file: CustomNode,
};

function CanvasInner() {
  // Select raw arrays + hiddenIds, then derive visible nodes/edges with useMemo.
  // This avoids creating new array references on every store update (which would
  // cause useSyncExternalStore to loop).
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const direction = useGraphStore((s) => s.direction);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const applyNodeChanges = useGraphStore((s) => s.applyNodeChanges);
  const commitHistory = useGraphStore((s) => s.commitHistory);
  const { toast } = useToast();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Use the same reference for `nodes` so downstream effects don't refire.
  const nodes = visibleNodes;
  const edges = visibleEdges;

  const { fitView, zoomIn, zoomOut, getNodes } = useReactFlow();

  // Re-fit the view whenever the layout direction changes so the user
  // actually sees the repositioned graph.
  useEffect(() => {
    if (nodes.length === 0) return;
    const t = setTimeout(() => {
      fitView({ duration: 500, padding: 0.2, maxZoom: 1.0 });
    }, 80);
    return () => clearTimeout(t);
  }, [direction, nodes.length, fitView]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setSelectedNodeIds(selected.map((n) => n.id));
    },
    [setSelectedNodeIds]
  );

  /**
   * Receive every React Flow change event (drag, select, dimension) and
   * apply it to the store WITHOUT pushing history. Position changes during
   * drag fire many times per second — committing them all to history would
   * flood the undo stack.
   */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges(changes);
    },
    [applyNodeChanges]
  );

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
      nodes: selected.map((n) => n.id),
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
    <div ref={containerRef} className="relative h-full w-full">
      {/* Canvas-level context menu (right-click on empty canvas) */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onSelectionDragStop={onSelectionDragStop}
              onSelectionChange={onSelectionChange}
              onDelete={({ nodes }) => deleteNodes(nodes.map((n) => n.id))}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }}
              minZoom={0.15}
              maxZoom={3}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: {
                  stroke: isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(71, 85, 105, 0.4)",
                  strokeWidth: 1.5,
                },
              }}
              proOptions={{ hideAttribution: true }}
              className="bg-transparent"
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

              {nodes.length === 0 && (
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
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel className="text-xs text-muted-foreground">
            Canvas actions
          </ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => fitView({ duration: 500, padding: 0.2 })}
            className="cursor-pointer"
          >
            Fit View
          </ContextMenuItem>
          <ContextMenuItem onSelect={selectAll} className="cursor-pointer">
            Select All
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => zoomIn({ duration: 250 })}
            className="cursor-pointer"
          >
            Zoom In
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => zoomOut({ duration: 250 })}
            className="cursor-pointer"
          >
            Zoom Out
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              useGraphStore.getState().unhideAll();
              toast({
                title: "Unhid all nodes",
                description: `${hiddenCount} node${hiddenCount === 1 ? "" : "s"} restored`,
              });
            }}
            className="cursor-pointer"
            disabled={hiddenCount === 0}
          >
            Unhide All Nodes
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
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
