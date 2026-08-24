"use client";

import { useMemo, useState, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw,
  FolderOpen,
  Trash2,
  Layers,
  HardDrive,
  SlidersHorizontal,
  FileIcon,
  Spline,
  FilePlus,
  FolderPlus,
  EyeOff,
} from "lucide-react";
import type { EdgeStyle } from "@/lib/fewer/types";
import { defaultDirection } from "@/store/slices/layoutSlice";
import { CollapsibleSection, AnimatedConditional } from "./CollapsibleSection";
import { HiddenNodesPanel } from "./HiddenNodesPanel";
import { LayoutPicker } from "./LayoutPicker";
import { StatsPanel, SavedGraphsPanel } from ".";
import { useAuth } from "@/hooks/use-auth";
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

interface SidebarProps {
  onOpenDirectory: () => void;
  onRequireAuth: () => void;
}


export function Sidebar({ onOpenDirectory, onRequireAuth }: SidebarProps) {
  const { user } = useAuth();
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const relayout = useGraphStore((s) => s.relayout);
  const reset = useGraphStore((s) => s.reset);
  const { toast } = useToast();
  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const edges = useGraphStore((s) => s.edges);

  const hiddenPanelExpandTrigger = useGraphStore((s) => s.hiddenPanelExpandTrigger);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (!advancedModeEnabled && (direction === "BT" || direction === "RL")) {
      setDirection("TB");
    }
  }, [advancedModeEnabled, direction, setDirection]);

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

  return (
    <aside className="gm-glass gm-aurora flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-border/30 p-3">
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto overflow-x-hidden pr-0.5 gm-scroll w-full min-w-0">
        
        {/* ── 1. FILE & ACTIONS ── */}
        <CollapsibleSection title="File & Actions" icon={HardDrive} defaultOpen>
          <div className="space-y-2.5 w-full min-w-0">
            {/* Primary Action Button (shadcn) — opens the unified 3-step
                import flow at step 1 (origin selection). */}
            <Button
              className="w-full gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-transform active:scale-[0.98] min-w-0 h-10"
              onClick={onOpenDirectory}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">Import</span>
            </Button>

            {/* Quick Canvas Toolbar Buttons (shadcn) */}
            <div className="flex items-center gap-1 pt-1 border-t border-border/20 w-full min-w-0">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 min-w-0 gap-1 text-xs text-muted-foreground hover:text-foreground justify-start px-2"
                onClick={() => handleAddNode("file")}
              >
                <FilePlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">File</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 min-w-0 gap-1 text-xs text-muted-foreground hover:text-foreground justify-start px-2"
                onClick={() => handleAddNode("folder")}
              >
                <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Folder</span>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-auto"
                    onClick={() => setResetConfirmOpen(true)}
                    disabled={nodes.length === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Clear Canvas
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── 1.5 YOUR DIRECTORIES (logged-in only) ── */}
        {user && (
          <CollapsibleSection title="Your Directories" icon={FolderOpen} defaultOpen>
            <SavedGraphsPanel onRequireAuth={onRequireAuth} />
          </CollapsibleSection>
        )}

        {/* ── 2. LAYOUT & ORIENTATION ── */}
        <CollapsibleSection title="Layout" icon={SlidersHorizontal} defaultOpen>
          <div className="flex flex-col gap-3 w-full min-w-0">
            {/* Orientation choice cards; advanced orientations slide in with advanced mode. */}
            <LayoutPicker
              direction={direction}
              onPick={setDirection}
              advancedModeEnabled={advancedModeEnabled}
            />

            {/* Layout policy sliders (Max Depth, Auto-hide, Crown Shyness) live in
                Settings → Advanced. Sidebar stays focused on per-graph actions. */}

            {/* Rearrange Action Button (shadcn) */}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-border/60 hover:bg-muted/40 text-xs font-normal min-w-0"
              onClick={() => {
                relayout();
                toast({ title: "Graph rearranged" });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">Auto-Rearrange Graph</span>
            </Button>

            <div className="flex items-center justify-between rounded-lg border border-border/20 p-2.5 bg-card/5 w-full min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label htmlFor="show-files" className="text-xs font-medium cursor-pointer truncate">
                  Include File Nodes
                </Label>
              </div>
              <Switch
                id="show-files"
                checked={showFiles}
                onCheckedChange={setShowFiles}
                className="shrink-0"
              />
            </div>
          </div>

        </CollapsibleSection>

        {/* ── 3. EDGES & STYLE ── */}
        <CollapsibleSection title="Edges & Style" icon={Spline} defaultOpen={false}>
          <div className="flex flex-col gap-3 w-full min-w-0">
            <div className="space-y-1.5 w-full min-w-0">
              <Label className="text-[11px] font-medium text-muted-foreground">Style</Label>
              <SlidingToggle
                options={availableEdgeStyles}
                value={edgeStyle}
                onValueChange={(v) => setEdgeStyle(v as EdgeStyle)}
              />
            </div>

            {/* Edge fine-tuning (corner radius, motion, pattern, thickness) lives in
                Settings → Appearance → Edge Styling. Sidebar keeps the quick style picker. */}
          </div>
        </CollapsibleSection>

        {/* ── 5. HIDDEN NODES RECOVERY ── */}
        {hiddenIds.length > 0 && (
          <CollapsibleSection
            title="Hidden Nodes"
            icon={EyeOff}
            badge={String(hiddenIds.length)}
            forceOpen={hiddenPanelExpandTrigger}
            defaultOpen
          >
            <HiddenNodesPanel />
          </CollapsibleSection>
        )}

        {/* ── 6. GRAPH ANALYTICS ── */}
        <AnimatedConditional show={advancedModeEnabled && nodes.length > 0} delay={100}>
          <CollapsibleSection title="Graph Analytics" icon={Layers} defaultOpen={false}>
            <StatsPanel />
          </CollapsibleSection>
        </AnimatedConditional>

      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-medium">Clear canvas?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-normal">
              This will remove all {plural(nodes.length, "node")} and{" "}
              {plural(edges.length, "edge")} from your graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs font-normal">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                setResetConfirmOpen(false);
                toast({ title: "Canvas cleared" });
              }}
              className="bg-destructive text-white hover:bg-destructive/90 text-xs font-normal"
            >
              Clear Canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}