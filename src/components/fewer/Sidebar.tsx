"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useGraphData, useLayoutConfig, useUiState, useViewState, useDialogState, useStoreActions } from "@/store/hooks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  RefreshCw,
  FolderOpen,
  Trash2,
  Layers,
  HardDrive,
  SlidersHorizontal,
  Spline,
  FilePlus,
  FolderPlus,
  EyeOff,
  Tag as TagIcon,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import type { EdgeStyle } from "@/lib/fewer/types";
import { defaultDirection } from "@/store/slices/layoutSlice";
import { CollapsibleSection, AnimatedConditional } from "./CollapsibleSection";
import { HiddenNodesPanel } from "./HiddenNodesPanel";
import { LayoutPicker } from "./LayoutPicker";
import { StatsPanel, SavedGraphsPanel, TagsPanel } from ".";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SlidingToggle } from "../ui/sliding-toggle";
import { plural } from "@/lib/fewer/plural";
import { sectionsDockedInTree } from "@/lib/fewer/panelTree";
import type { AreaEditor } from "@/lib/fewer/panelLayout";
import { useActiveLeaf } from "@/hooks/use-active-leaf";
import { NON_DOCKABLE_SECTIONS } from "./sectionRegistry";
import { startSectionDrag } from "./SectionDragLayer";
import { can } from "@/lib/fewer/tiers";
import { moveSection } from "@/lib/fewer/sidebarOrder";

interface SidebarProps {
  onOpenDirectory: () => void;
  onRequireAuth: () => void;
}

export function Sidebar({ onOpenDirectory, onRequireAuth }: SidebarProps) {
  const { toast } = useToast();
  const activeLeaf = useActiveLeaf();
  const { nodes, edges, hiddenIds } = useGraphData();
  const { direction, edgeStyle } = useLayoutConfig();
  const { selectedNodeIds } = useUiState();
  const { panelTree } = useViewState();
  const { sidebarSide, setSidebarSide } = useDialogState();
  const { setDirection, setEdgeStyle, reset } = useStoreActions();
  const tags = useGraphStore((s) => s.tags);
  const hiddenPanelExpandTrigger = useGraphStore((s) => s.hiddenPanelExpandTrigger);
  const savedGraphsExpandTrigger = useGraphStore((s) => s.savedGraphsExpandTrigger);
  const sidebarOrder = useGraphStore((s) => s.sidebarOrder);
  const setSidebarOrder = useGraphStore((s) => s.setSidebarOrder);
  const tier = useGraphStore((s) => s.tier);

  // Section ids currently docked in an area — these get hidden from sidebar
  const dockedIds = useMemo(() => sectionsDockedInTree(panelTree), [panelTree]);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // W1: scroll "Your Directories" into view when the expand trigger fires
  const dirRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (savedGraphsExpandTrigger > 0) {
      dirRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [savedGraphsExpandTrigger]);

  useEffect(() => {
    if (!can("layoutOrientation", tier) && (direction === "BT" || direction === "RL")) {
      setDirection("TB");
    }
  }, [tier, direction, setDirection]);

  // On first client mount, apply the responsive default layout direction
  // (LR on screens <1.5k, TB otherwise). The store starts as "TB" for an
  // isomorphic SSR/hydration match, so this picks the right orientation here.
  // Skip when a graph is already loaded (e.g. a shared URL) so a load's own
  // direction is never clobbered.
  useEffect(() => {
    const def = defaultDirection();
    if (def !== "TB" && useGraphStore.getState().nodes.length === 0) {
      setDirection(def);
    }
  }, []);

  // Drag handle factory — grip renders for all tiers (reorder always works);
  // dock behavior is gated inside SectionDragLayer via can("panelWorkspace", tier).
  const dragProps = (id: AreaEditor): { dragHandleProps: React.HTMLAttributes<HTMLButtonElement> } | undefined =>
    NON_DOCKABLE_SECTIONS.has(id) || dockedIds.has(id)
      ? undefined
      : {
          dragHandleProps: {
            onPointerDown: (e: React.PointerEvent) => startSectionDrag(id, e),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (!e.altKey) return;
              const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
              if (dir === 0) return;
              e.preventDefault();
              const current = useGraphStore.getState().sidebarOrder;
              const idx = current.indexOf(id);
              if (idx === -1) return;
              useGraphStore.getState().setSidebarOrder(moveSection(current, id, idx + dir));
            },
          },
        };

  const availableEdgeStyles = useMemo(() => [
    { value: "curved" as EdgeStyle, label: "Curved" },
    { value: "straight" as EdgeStyle, label: "Straight" },
    { value: "angled" as EdgeStyle, label: "Angled" },
  ], []);

  const handleAddNode = (type: "file" | "folder") => {
    const selectedFolderId = selectedNodeIds.length === 1
      ? nodes.find((n) => n.id === selectedNodeIds[0] && n.data.type === "folder")?.id
      : undefined;
    const name = type === "file" ? "new-file.txt" : "New Folder";
    const newId = selectedFolderId
      ? useGraphStore.getState().addNode(selectedFolderId, name, type)
      : useGraphStore.getState().addStandaloneNode(name, type, { x: 1000, y: 600 });
    useGraphStore.getState().setRenamingId(newId);
    useGraphStore.getState().setZoomToNode(newId);
    toast({
      title: type === "folder" ? "Folder added" : "File added",
      description: selectedFolderId ? `"${name}" added to folder` : `"${name}" added to canvas`,
    });
  };

  // Build section nodes keyed by id, then render in sidebarOrder
  const sections: Record<string, React.ReactNode> = {};

  if (!dockedIds.has("file")) {
    sections.file = (
      <CollapsibleSection title="File & Actions" icon={HardDrive} defaultOpen {...dragProps("file")}>
        <div className="space-y-2.5 w-full min-w-0">
          <Button className="w-full gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-transform active:scale-[0.98] min-w-0 h-10" onClick={onOpenDirectory}>
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">Import</span>
          </Button>
          <div className="flex items-center gap-1 pt-1 border-t border-border/20 w-full min-w-0">
            <Button variant="ghost" size="sm" className="flex-1 min-w-0 gap-1 text-xs text-muted-foreground hover:text-foreground justify-start px-2" onClick={() => handleAddNode("file")}>
              <FilePlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">File</span>
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 min-w-0 gap-1 text-xs text-muted-foreground hover:text-foreground justify-start px-2" onClick={() => handleAddNode("folder")}>
              <FolderPlus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Folder</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-auto" onClick={() => setResetConfirmOpen(true)} disabled={nodes.length === 0}>
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Clear Canvas</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CollapsibleSection>
    );
  }

  if (can("savedGraphs", tier) && !dockedIds.has("directories")) {
    sections.directories = (
      <div ref={dirRef} data-section-id="directories">
        <CollapsibleSection title="Your Directories" icon={FolderOpen} defaultOpen forceOpen={savedGraphsExpandTrigger} {...dragProps("directories")}>
          <SavedGraphsPanel onRequireAuth={onRequireAuth} />
        </CollapsibleSection>
      </div>
    );
  }

  if (!dockedIds.has("layout")) {
    sections.layout = (
      <CollapsibleSection title="Layout" icon={SlidersHorizontal} defaultOpen {...dragProps("layout")}>
        <div className="flex flex-col gap-3 w-full min-w-0">
          <LayoutPicker
            direction={activeLeaf?.resolved.direction ?? direction}
            onPick={(d) => { if (activeLeaf) useGraphStore.getState().updateViewSettings(activeLeaf.leafId, { direction: d }); else setDirection(d); }}
            advancedModeEnabled={can("layoutOrientation", tier)}
          />
          <Button size="sm" className="w-full gap-2 border-border/60 text-xs font-semibold min-w-0" onClick={() => { useGraphStore.getState().organize(activeLeaf?.leafId ?? null); toast({ title: "Graph organized" }); }}>
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text" />
            <span className="truncate">Organize</span>
          </Button>
        </div>
      </CollapsibleSection>
    );
  }

  if (!dockedIds.has("edges")) {
    sections.edges = (
      <CollapsibleSection title="Connections & Style" icon={Spline} defaultOpen={false} {...dragProps("edges")}>
        <div className="flex flex-col gap-3 w-full min-w-0">
          <div className="space-y-1.5 w-full min-w-0">
            <Label className="text-[11px] font-medium text-muted-foreground">Style</Label>
            <SlidingToggle options={availableEdgeStyles} value={activeLeaf?.resolved.edgeStyle ?? edgeStyle} onValueChange={(v) => { if (activeLeaf) useGraphStore.getState().updateViewSettings(activeLeaf.leafId, { edgeStyle: v as EdgeStyle }); else setEdgeStyle(v as EdgeStyle); }} />
          </div>
        </div>
      </CollapsibleSection>
    );
  }

  if (can("tags", tier) && !dockedIds.has("tags") && nodes.length > 0) {
    sections.tags = (
      <CollapsibleSection title="Tags" icon={TagIcon} badge={tags.length > 0 ? String(tags.length) : undefined} defaultOpen={false} {...dragProps("tags")}>
        <TagsPanel />
      </CollapsibleSection>
    );
  }

  if (!dockedIds.has("analytics")) {
    sections.analytics = (
      <AnimatedConditional show={can("graphAnalytics", tier) && nodes.length > 0} delay={100}>
        <CollapsibleSection title="Graph Analytics" icon={Layers} defaultOpen={false} {...dragProps("analytics")}>
          <StatsPanel />
        </CollapsibleSection>
      </AnimatedConditional>
    );
  }

  // ponytail: resolved.hiddenIds already includes file ids when files are
  // bulk-hidden (computeEffectiveHidden adds allFileIds) or when global
  // showFiles=false (setShowFiles adds fileIds to hiddenIds) — adding
  // fileCount here double-counted every hidden file (30 files -> badge 60).
  if (!dockedIds.has("hidden")) {
    const viewHidden = activeLeaf ? activeLeaf.resolved.hiddenIds.length > 0 : hiddenIds.length > 0;
    const viewFiltersFiles = activeLeaf ? !activeLeaf.resolved.showFiles : false;
    const hiddenCount = activeLeaf ? activeLeaf.resolved.hiddenIds.length : hiddenIds.length;
    if (viewHidden || viewFiltersFiles) {
      sections.hidden = (
        <CollapsibleSection title="Hidden Cards" icon={EyeOff} badge={String(hiddenCount)} forceOpen={hiddenPanelExpandTrigger} defaultOpen {...dragProps("hidden")}>
          <HiddenNodesPanel />
        </CollapsibleSection>
      );
    }
  }

  return (
    <aside
      className={cn(
        "gm-glass gm-aurora flex h-full w-full min-w-0 flex-col overflow-hidden p-3",
        sidebarSide === "left" ? "border-r border-border/30" : "border-l border-border/30",
      )}
    >
      {/* Side toggle */}
      <div className="flex items-center justify-end shrink-0 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setSidebarSide(sidebarSide === "left" ? "right" : "left")} title={`Move sidebar to ${sidebarSide === "left" ? "right" : "left"} side`}>
              {sidebarSide === "left" ? <PanelRight className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Move sidebar to {sidebarSide === "left" ? "right" : "left"}</TooltipContent>
        </Tooltip>
      </div>

      <div data-sidebar-sections className="flex-1 flex flex-col gap-3 overflow-y-auto overflow-x-hidden pr-0.5 gm-scroll w-full min-w-0">
        {sidebarOrder.filter((id) => sections[id]).map((id) => (
          <div key={id} data-section-id={id}>{sections[id]}</div>
        ))}
      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-medium">Clear canvas?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This will remove all {plural(nodes.length, "card")} and{" "}
              {plural(edges.length, "connection")} from your graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                setResetConfirmOpen(false);
                toast({ title: "Canvas cleared" });
              }}
              className="bg-destructive text-white hover:bg-destructive/90 text-xs text-muted-foreground"
            >
              Clear Canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
