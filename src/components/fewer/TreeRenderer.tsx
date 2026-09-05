"use client";

import { useCallback, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { cn } from "@/lib/utils";
import type { PanelNode, PanelSplit } from "@/lib/fewer/panelTree";
import { isLeaf, isSplit, setDividerRatio as treeSetDividerRatio } from "@/lib/fewer/panelTree";
import { DockArea } from "./DockArea";
import { CornerGrip } from "./CornerGrip";
import { saveLayoutToStorage, AREA_EDITOR_LABELS, type PanelArea } from "@/lib/fewer/panelLayout";
import { SECTION_CATALOG, NON_DOCKABLE_SECTIONS, sectionMetaById } from "./sectionRegistry";
import dynamic from "next/dynamic";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

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
    <div className="relative hidden sm:block flex-1 min-h-0 min-w-0">
      <div className="absolute inset-0">
        <TreeNode node={tree} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
      </div>
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
  const isGraph = leaf.area.editor === "graph";
  const meta = sectionMetaById(leaf.area.editor);

  return (
    <div
      ref={containerRef}
      data-leaf-id={leaf.area.id}
      className="group relative flex flex-col h-full w-full min-h-0 min-w-0 border-border/20"
    >
      {/* Unified header bar for all leaf types */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/20 shrink-0 bg-card/30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-between gap-1 h-7 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground px-1.5"
            >
              <span className="truncate text-left">
                {isGraph ? AREA_EDITOR_LABELS.graph : meta?.title ?? leaf.area.editor}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Editor Type
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => useGraphStore.getState().setAreaEditor(leaf.area.id, "graph")}
              className="text-xs cursor-pointer"
              disabled={isGraph}
            >
              {AREA_EDITOR_LABELS.graph}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {SECTION_CATALOG.filter((s) => !NON_DOCKABLE_SECTIONS.has(s.id)).map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => useGraphStore.getState().setAreaEditor(leaf.area.id, s.id)}
                className="text-xs cursor-pointer"
                disabled={leaf.area.editor === s.id}
              >
                {s.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {!leaf.primary && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => useGraphStore.getState().joinArea(leaf.area.id)}
            title="Close (merge into neighbor)"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Content */}
      {isGraph ? (
        <div className="relative min-w-0 flex-1 min-h-0">
          <GraphCanvasForLeaf
            onOpenImport={onOpenImport}
            onLoadSample={onLoadSample}
            primary={!!leaf.primary}
          />
        </div>
      ) : (
        <DockArea area={leaf.area} />
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
    <div className={cn("flex h-full w-full min-h-0 min-w-0", isH ? "flex-row" : "flex-col")}>
      <div className="relative min-h-0 min-w-0" style={isH ? { flex: `${split.ratio} 1 0%` } : { height: `${pct}%` }}>
        <div className="absolute inset-0">
          <TreeNode node={split.first} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
        </div>
      </div>

      {/* Divider */}
      <div
        onMouseDown={startDividerDrag}
        className={cn(
          "shrink-0 z-10 bg-border/60 hover:bg-primary/40 transition-colors",
          isH ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        )}
      />

      <div className="relative min-h-0 min-w-0" style={isH ? { flex: `${1 - split.ratio} 1 0%` } : { height: `${100 - pct}%` }}>
        <div className="absolute inset-0">
          <TreeNode node={split.second} onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
        </div>
      </div>
    </div>
  );
}

/** Get the first leaf id in a subtree (for divider ratio keying). */
function getFirstLeafId(node: PanelNode): string {
  if (isLeaf(node)) return node.area.id;
  return getFirstLeafId(node.first);
}