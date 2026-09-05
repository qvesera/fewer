"use client";

import { useCallback, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { cn } from "@/lib/utils";
import type { PanelNode, PanelSplit } from "@/lib/fewer/panelTree";
import { isLeaf, isSplit, setDividerRatio as treeSetDividerRatio } from "@/lib/fewer/panelTree";
import { DockArea } from "./DockArea";
import { CornerGrip } from "./CornerGrip";
import { saveLayoutToStorage } from "@/lib/fewer/panelLayout";
import dynamic from "next/dynamic";

const GraphCanvasForLeaf = dynamic(
  () => import("./GraphCanvas").then((m) => m.GraphCanvas),
  { ssr: false },
);

interface TreeRendererProps {
  tree: PanelNode;
  onOpenImport: () => void;
  onLoadSample: () => void;
}

/**
 * Recursively renders the split tree. Splits become flex containers with
 * draggable dividers. Leaves render as section panels or graph viewports.
 */
export function TreeRenderer({ tree, onOpenImport, onLoadSample }: TreeRendererProps) {
  return (
    <div className="flex min-h-0 flex-1 min-w-0 hidden sm:flex">
      <TreeNode node={tree} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
    </div>
  );
}

function TreeNode({
  node,
  onOpenImport,
  onLoadSample,
}: {
  node: PanelNode;
  onOpenImport: () => void;
  onLoadSample: () => void;
}) {
  if (isLeaf(node)) {
    return <LeafNode leaf={node} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />;
  }
  return <SplitNode split={node} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />;
}

function LeafNode({
  leaf,
  onOpenImport,
  onLoadSample,
}: {
  leaf: { kind: "leaf"; area: import("@/lib/fewer/panelLayout").PanelArea; primary?: boolean };
  onOpenImport: () => void;
  onLoadSample: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      data-leaf-id={leaf.area.id}
      className="group relative flex flex-col h-full w-full min-h-0 min-w-0"
    >
      {leaf.area.editor === "graph" ? (
        <main id="main-content" className="relative min-w-0 flex-1 min-h-0">
          <GraphCanvasForLeaf
            onOpenImport={onOpenImport}
            onLoadSample={onLoadSample}
            primary={!!leaf.primary}
          />
        </main>
      ) : (
        <DockArea area={leaf.area} side="left" />
      )}
      <CornerGrip leafId={leaf.area.id} containerRef={containerRef} />
    </div>
  );
}

function SplitNode({
  split,
  onOpenImport,
  onLoadSample,
}: {
  split: PanelSplit;
  onOpenImport: () => void;
  onLoadSample: () => void;
}) {
  const setPanelTree = useGraphStore((s) => s.setPanelTree);
  const panelTree = useGraphStore((s) => s.panelTree);
  const dividerRef = useRef(false);

  const isH = split.dir === "h";

  // Find the two leaf ids for ratio adjustment
  const firstLeafId = getFirstLeafId(split.first);
  const secondLeafId = getFirstLeafId(split.second);

  const startDividerDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dividerRef.current = true;
      document.body.style.cursor = isH ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();

      const onMove = (ev: MouseEvent) => {
        if (!dividerRef.current) return;
        const ratio = isH
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
        // Clamp
        const clamped = Math.max(0.15, Math.min(0.85, ratio));
        // Apply directly via setDividerRatio through the store
        const currentTree = useGraphStore.getState().panelTree;
        const newTree = treeSetDividerRatio(currentTree, firstLeafId, secondLeafId, clamped);
        if (newTree !== currentTree) {
          useGraphStore.setState({ panelTree: newTree });
        }
      };
      const onUp = () => {
        dividerRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Persist
        const { panelTree: t, sidebarSide } = useGraphStore.getState();
        saveLayoutToStorage({ sidebarSide, panelTree: t });
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isH, firstLeafId, secondLeafId],
  );

  const flexStyle = isH
    ? { flexDirection: "row" as const, width: "100%" }
    : { flexDirection: "column" as const, height: "100%" };
  const pct = Math.round(split.ratio * 100);

  return (
    <div className={cn("flex min-h-0 min-w-0", isH ? "flex-row flex-1" : "flex-col min-h-0 flex-1")}>
      <div className={cn("min-h-0 min-w-0", isH ? "flex-1" : "")} style={isH ? { flex: `${split.ratio}` } : { height: `${pct}%` }}>
        <TreeNode node={split.first} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
      </div>

      {/* Divider */}
      <div
        onMouseDown={startDividerDrag}
        className={cn(
          "shrink-0 z-10 bg-border/60 hover:bg-primary/40 transition-colors",
          isH ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
      />

      <div className={cn("min-h-0 min-w-0", isH ? "flex-1" : "")} style={isH ? { flex: `${1 - split.ratio}` } : { height: `${100 - pct}%` }}>
        <TreeNode node={split.second} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
      </div>
    </div>
  );
}

/** Get the first leaf id in a subtree (for divider ratio keying). */
function getFirstLeafId(node: PanelNode): string {
  if (isLeaf(node)) return node.area.id;
  return getFirstLeafId(node.first);
}