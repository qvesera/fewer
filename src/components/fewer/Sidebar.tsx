"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ArrowDownToLine,
  ArrowRightFromLine,
  ArrowUpFromLine,
  ArrowLeftToLine,
  RefreshCw,
  FolderOpen,
  Upload,
  Trash2,
  Eye,
  ChevronRight,
  Palette,
  Layers,
  HardDrive,
  SlidersHorizontal,
  Globe,
  FileIcon,
  Spline,
  Info,
  FilePlus,
  FolderPlus,
  EyeOff,
} from "lucide-react";
import type { LayoutDirection, EdgeStyle, EdgeStrokeStyle, FewerNode, FewerEdge } from "@/lib/fewer/types";
import { StatsPanel, RenameInput } from ".";
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SlidingToggle } from "../ui/sliding-toggle";

const PRIMARY_LAYOUTS: {
  value: LayoutDirection;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "TB", label: "Vertical", sublabel: "Top → Down", icon: ArrowDownToLine },
  { value: "LR", label: "Horizontal", sublabel: "Left → Right", icon: ArrowRightFromLine },
];

const ADVANCED_LAYOUTS: {
  value: LayoutDirection;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "BT", label: "Upward", sublabel: "Bottom → Top", icon: ArrowUpFromLine },
  { value: "RL", label: "Reverse", sublabel: "Right → Left", icon: ArrowLeftToLine },
];

interface SidebarProps {
  onOpenDirectory: () => void;
  onImportFromFile: () => void;
  onImportFromUrl: () => void;
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  forceOpen,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: string;
  forceOpen?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceOpen !== undefined && forceOpen > 0) {
      setOpen(true);
    }
  }, [forceOpen]);

  return (
    <section 
      ref={sectionRef} 
      className="w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-xl border border-border/30 bg-card/10 transition-colors duration-200 hover:border-border/60 focus-within:border-border/80"
    >
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-3 h-auto text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors rounded-xl outline-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 justify-start"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground/70 shrink-0", open && "rotate-90")} />
        <Icon className="h-4 w-4 shrink-0 text-primary/80" />
        <span className="truncate flex-1 text-left">{title}</span>
        {badge && (
          <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {badge}
          </span>
        )}
      </Button>
      <div
        className={cn(
          "grid w-full min-w-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open 
            ? "grid-rows-[1fr] opacity-100 translate-y-0 pb-3" 
            : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none pb-0"
        )}
      >
        <div className="w-full min-w-0 min-h-0 overflow-hidden px-3">
          <div className="flex flex-col gap-3 pt-1 w-full min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

function AnimatedConditional({
  show,
  delay = 0,
  children,
}: {
  show: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(show);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (show) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setIsAnimatingIn(false);
      timer = setTimeout(() => setShouldRender(false), 250);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!shouldRender) return null;

  const active = show && isAnimatingIn;

  return (
    <div
      // Added `shrink-0` to the animated wrapper
      className={cn(
        "grid w-full min-w-0 shrink-0 transition-[grid-template-rows,opacity,transform] duration-250 ease-in-out",
        active
          ? "grid-rows-[1fr] opacity-100 scale-y-100"
          : "grid-rows-[0fr] opacity-0 scale-y-95 pointer-events-none"
      )}
      style={{ transitionDelay: active ? `${delay}ms` : "0ms" }}
    >
      <div className="w-full min-w-0 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

interface HiddenTreeNode {
  node: FewerNode;
  children: HiddenTreeNode[];
}

function getHiddenLayerData(nodes: FewerNode[], edges: FewerEdge[], hiddenIds: string[]): HiddenTreeNode[] {
  const idSet = new Set(hiddenIds);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();
  for (const e of edges) {
    parentMap.set(e.target, e.source);
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
  }

  const roots: HiddenTreeNode[] = [];
  const processed = new Set<string>();

  function build(id: string): HiddenTreeNode {
    processed.add(id);
    const node = nodeMap.get(id)!;
    const children = (childrenMap.get(id) ?? [])
      .filter((cid) => idSet.has(cid))
      .map((cid) => build(cid));
    return { node, children };
  }

  for (const id of hiddenIds) {
    if (processed.has(id)) continue;
    const parentId = parentMap.get(id);
    if (parentId && idSet.has(parentId)) continue;
    roots.push(build(id));
  }

  return roots;
}

function HiddenNodeRow({ tree, depth = 0 }: { tree: HiddenTreeNode; depth?: number }) {
  const renamingId = useGraphStore((s) => s.renamingId);
  const renameNode = useGraphStore((s) => s.renameNode);
  const showAncestors = useGraphStore((s) => s.showAncestors);
  const { toast } = useToast();
  const [open, setOpen] = useState(depth === 0);
  const isFolder = tree.node.data.type === "folder";
  
  const unreveal = (id: string) => {
    if (isFolder) {
      useGraphStore.getState().revealSubtree(id);
      toast({ title: "Subtree shown", description: tree.node.data.label });
    } else {
      showAncestors(id);
      toast({ title: "Node shown", description: tree.node.data.label });
    }
  };
  
  const node = tree.node;
  const hasChildren = tree.children.length > 0;

  return (
    <div className="space-y-0.5 w-full min-w-0">
      <div className="group flex items-center rounded-md py-1 pr-1.5 text-xs hover:bg-muted/50 w-full min-w-0">
        
        {/* ── 1. PINNED LEFT EYE ICON (Always at x=0 regardless of depth) ── */}
        <button
          type="button"
          onClick={() => unreveal(node.id)}
          title={isFolder ? "Show folder and its children" : "Show this item"}
          aria-label={isFolder ? "Show subtree" : "Show item"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>

        {/* ── 2. INDENTED CONTENT (Chevron, Dot, Label) ── */}
        <div 
          className="flex items-center gap-1.5 min-w-0 flex-1"
          style={{ paddingLeft: `${depth * 10}px` }} // Adjust 10px to increase/decrease tree indentation
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              title={open ? "Collapse" : "Expand"}
              aria-label={open ? "Collapse" : "Expand"}
              className="h-4 w-4 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              node.data.type === "folder" ? "bg-orange-500" : "bg-purple-500",
            )}
          />

          {renamingId === node.id ? (
            <RenameInput
              initialValue={node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label}
              onCommit={(v) => renameNode(node.id, v)}
              onCancel={() => useGraphStore.getState().setRenamingId(null)}
            />
          ) : (
            <span className="truncate text-foreground/90 flex-1 min-w-0 text-[11px] leading-tight">
              {node.data.label}
            </span>
          )}
        </div>
      </div>

      {/* ── 3. CHILDREN WRAPPER (NO PADDING HERE) ── */}
      {open && hasChildren && (
        <div className="space-y-0.5 w-full min-w-0">
          {tree.children.map((child) => (
            <HiddenNodeRow key={child.node.id} tree={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onOpenDirectory, onImportFromFile, onImportFromUrl }: SidebarProps) {
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const edgeAnimated = useGraphStore((s) => s.edgeAnimated);
  const setEdgeAnimated = useGraphStore((s) => s.setEdgeAnimated);
  const edgeStrokeStyle = useGraphStore((s) => s.edgeStrokeStyle);
  const setEdgeStrokeStyle = useGraphStore((s) => s.setEdgeStrokeStyle);
  const edgeWidth = useGraphStore((s) => s.edgeWidth);
  const setEdgeWidth = useGraphStore((s) => s.setEdgeWidth);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setCornerRadius = useGraphStore((s) => s.setCornerRadius);
  const relayout = useGraphStore((s) => s.relayout);
  const reset = useGraphStore((s) => s.reset);
  const { toast } = useToast();
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const showAll = useGraphStore((s) => s.showAll);
  const maxDisplayDepth = useGraphStore((s) => s.maxDisplayDepth);
  const setMaxDisplayDepth = useGraphStore((s) => s.setMaxDisplayDepth);
  const autoHideThreshold = useGraphStore((s) => s.autoHideThreshold);
  const setAutoHideThreshold = useGraphStore((s) => s.setAutoHideThreshold);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  const hiddenPanelExpandTrigger = useGraphStore((s) => s.hiddenPanelExpandTrigger);

  const hiddenTree = useMemo(
    () => getHiddenLayerData(nodes, edges, hiddenIds),
    [nodes, edges, hiddenIds],
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (!advancedModeEnabled && (direction === "BT" || direction === "RL")) {
      setDirection("TB");
    }
  }, [advancedModeEnabled, direction, setDirection]);

  const availableEdgeStyles = useMemo(() => [
    { value: "curved" as EdgeStyle, label: "Curved" },
    { value: "straight" as EdgeStyle, label: "Straight" },
    { value: "angled" as EdgeStyle, label: "Angled" },
  ], []);

  const availableStrokeStyles = useMemo(() => {
    const list: { value: EdgeStrokeStyle; label: string }[] = [];
    if (!edgeAnimated) {
      list.push({ value: "solid", label: "Solid" });
    }
    list.push({ value: "dashed", label: "Dashed" });
    list.push({ value: "dotted", label: "Dotted" });
    return list;
  }, [edgeAnimated]);

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
  };

  return (
    <aside className="gm-glass gm-aurora flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-border/30 p-3">
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto overflow-x-hidden pr-0.5 gm-scroll w-full min-w-0">
        
        {/* ── 1. FILE & ACTIONS ── */}
        <CollapsibleSection title="File & Actions" icon={HardDrive} defaultOpen>
          <div className="space-y-2.5 w-full min-w-0">
            {/* Primary Action Button (shadcn) */}
            <Button
              className="w-full gap-2 text-sm font-semibold bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm transition-transform active:scale-[0.98] min-w-0 h-10"
              onClick={onOpenDirectory}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">Import Folder</span>
            </Button>
            
            <AnimatedConditional show={advancedModeEnabled} delay={0}>
              <div className="grid grid-cols-2 gap-2 pb-1 w-full min-w-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-w-0 gap-1.5 text-xs font-normal border-border/60 hover:bg-muted/50"
                  onClick={onImportFromFile}
                >
                  <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">File</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-w-0 gap-1.5 text-xs font-normal border-border/60 hover:bg-muted/50"
                  onClick={onImportFromUrl}
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">URL</span>
                </Button>
              </div>
            </AnimatedConditional>

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
              <TooltipProvider>
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
              </TooltipProvider>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── 2. LAYOUT & ORIENTATION ── */}
        <CollapsibleSection title="Layout" icon={SlidersHorizontal} defaultOpen>
          <div className="flex flex-col gap-3 w-full min-w-0">
            {/* Hybrid Choice Cards (Custom <button>) */}
            <div className="grid grid-cols-2 gap-2 w-full min-w-0">
              {PRIMARY_LAYOUTS.map((l) => {
                const Icon = l.icon;
                const active = direction === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setDirection(l.value)}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded-xl border transition-all active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0 overflow-hidden",
                      active
                        ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300 font-medium shadow-sm"
                        : "border-border/50 hover:border-border hover:bg-muted/30 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 mb-1 shrink-0" />
                    <span className="text-xs truncate w-full text-center font-medium">{l.label}</span>
                    <span className="text-[10px] text-muted-foreground/70 font-normal truncate w-full text-center">{l.sublabel}</span>
                  </button>
                );
              })}
            </div>

            <AnimatedConditional show={advancedModeEnabled} delay={50}>
              <div className="grid grid-cols-2 gap-2 w-full min-w-0">
                {ADVANCED_LAYOUTS.map((l) => {
                  const Icon = l.icon;
                  const active = direction === l.value;
                  return (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setDirection(l.value)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-xl border transition-all active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0 overflow-hidden",
                        active
                          ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300 font-medium shadow-sm"
                          : "border-border/50 hover:border-border hover:bg-muted/30 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 mb-0.5 shrink-0" />
                      <span className="text-xs truncate w-full text-center font-medium">{l.label}</span>
                      <span className="text-[10px] text-muted-foreground/70 font-normal truncate w-full text-center">{l.sublabel}</span>
                    </button>
                  );
                })}
              </div>
            </AnimatedConditional>

            <AnimatedConditional show={advancedModeEnabled} delay={50}>
              <div className="space-y-3 pt-1 w-full min-w-0">
                <div className="space-y-1.5 rounded-lg border border-border/20 bg-muted/10 p-2.5 w-full min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium text-foreground/80">Max Depth</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/60 cursor-pointer shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            Hide nodes deeper than this level.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {maxDisplayDepth === 0 ? "Unlimited" : `${maxDisplayDepth} lvl`}
                    </span>
                  </div>
                  <Slider
                    value={[maxDisplayDepth]}
                    onValueChange={([v]) => setMaxDisplayDepth(v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>

                <div className="space-y-1.5 rounded-lg border border-border/20 bg-muted/10 p-2.5 w-full min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-medium text-foreground/80">Auto-hide Limit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/60 cursor-pointer shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            Auto-collapse folders with more than this number of items.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{autoHideThreshold} items</span>
                  </div>
                  <Slider
                    value={[autoHideThreshold]}
                    onValueChange={([v]) => setAutoHideThreshold(v)}
                    min={2}
                    max={100}
                    step={1}
                  />
                </div>
              </div>
            </AnimatedConditional>

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

            {advancedModeEnabled && edgeStyle === "angled" && (
              <div className="space-y-1.5 rounded-lg border border-border/20 bg-muted/10 p-2.5 w-full min-w-0">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Corner Radius</Label>
                  <span className="text-xs font-mono text-muted-foreground">{cornerRadius}px</span>
                </div>
                <Slider
                  value={[cornerRadius]}
                  onValueChange={([v]) => setCornerRadius(v)}
                  min={0}
                  max={20}
                  step={1}
                />
              </div>
            )}

            <AnimatedConditional show={advancedModeEnabled} delay={50}>
              <div className="space-y-3 pt-2 border-t border-border/20 w-full min-w-0">
                <div className="space-y-1.5 w-full min-w-0">
                  <Label className="text-[11px] font-medium text-muted-foreground">Motion</Label>
                  <SlidingToggle
                    options={[
                      { value: "static" as const, label: "Static" },
                      { value: "animated" as const, label: "Animated" },
                    ]}
                    value={edgeAnimated ? "animated" : "static"}
                    onValueChange={(v) => setEdgeAnimated(v === "animated")}
                  />
                </div>

                <div className="space-y-1.5 w-full min-w-0">
                  <Label className="text-[11px] font-medium text-muted-foreground">Pattern</Label>
                  <SlidingToggle
                    options={availableStrokeStyles}
                    value={edgeStrokeStyle}
                    onValueChange={(v) => setEdgeStrokeStyle(v as EdgeStrokeStyle)}
                  />
                </div>

                <div className="space-y-1.5 rounded-lg border border-border/20 bg-muted/10 p-2.5 w-full min-w-0">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Line Thickness</Label>
                    <span className="text-xs font-mono text-muted-foreground">{edgeWidth}px</span>
                  </div>
                  <Slider
                    value={[edgeWidth]}
                    onValueChange={([v]) => setEdgeWidth(v)}
                    min={0.5}
                    max={6}
                    step={0.25}
                  />
                </div>
              </div>
            </AnimatedConditional>
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
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-border/60 hover:bg-muted/40 text-xs font-normal min-w-0"
              onClick={() => { showAll(); setShowFiles(true); }}
            >
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Reveal All Nodes</span>
            </Button>
            <div className="max-h-52 overflow-y-auto overflow-x-hidden rounded-lg border border-border/20 bg-muted/10 p-2 gm-scroll w-full min-w-0">
              {hiddenTree.map((root) => (
                <HiddenNodeRow key={root.node.id} tree={root} />
              ))}
            </div>
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
              This will remove all {nodes.length} node{nodes.length === 1 ? "" : "s"} and{" "}
              {edges.length} edge{edges.length === 1 ? "" : "s"} from your graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs font-normal">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                setResetConfirmOpen(false);
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