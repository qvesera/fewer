"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
  type OnSelectionChangeParams,
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

const nodeTypes: NodeTypes = {
  folder: CustomNode,
  file: CustomNode,
};

function CanvasInner() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const { fitView, zoomIn, zoomOut, getNodes } = useReactFlow();

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      setSelectedNodeIds(nodes.map((n) => n.id));
    },
    [setSelectedNodeIds]
  );

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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onSelectionChange={onSelectionChange}
        onDelete={({ nodes }) => deleteNodes(nodes.map((n) => n.id))}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.4 }}
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
            n.data?.type === "folder" ? "rgba(249, 115, 22, 0.7)" : "rgba(168, 85, 247, 0.7)"
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
            <div className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border border-border/40 bg-card/80 px-8 py-6 text-center shadow-2xl backdrop-blur-xl"
            )}>
              <div className="text-5xl">📁</div>
              <div className="text-lg font-semibold">No directory loaded</div>
              <div className="max-w-xs text-sm text-muted-foreground">
                Use the sidebar to open a directory from your file system, or load one of the
                sample datasets to explore the visualization.
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
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
