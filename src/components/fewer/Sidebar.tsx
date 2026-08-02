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
  Plus,
  EyeOff,
  Eye,
  ChevronRight,
  Palette,
  Layers,
  HardDrive,
  SlidersHorizontal,
  Globe,
  FileIcon,
} from "lucide-react";
import type { LayoutDirection, EdgeStyle, EdgeStrokeStyle, FewerNode } from "@/lib/fewer/types";
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
import { FewerEdge } from "@/lib/fewer/types";
import { useToast } from "@/hooks/use-toast";

const BASIC_LAYOUTS: {
  value: LayoutDirection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "TB", label: "Top → Bottom", icon: ArrowDownToLine },
  { value: "LR", label: "Left → Right", icon: ArrowRightFromLine },
];

const ADVANCED_LAYOUTS: {
  value: LayoutDirection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "BT", label: "Bottom → Top", icon: ArrowUpFromLine },
  { value: "RL", label: "Right → Left", icon: ArrowLeftToLine },
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

  useEffect(() => {
    if (open && sectionRef.current) {
      const el = sectionRef.current;
      const t = setTimeout(() => {
        const parent = el.closest(".gm-scroll");
        if (parent) {
          const sectionBottom = el.getBoundingClientRect().bottom;
          const parentBottom = parent.getBoundingClientRect().bottom;
          const overflow = sectionBottom - parentBottom;
          if (overflow > 0) {
            parent.scrollBy({ top: overflow + 16, behavior: "smooth" });
          }
        }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <section ref={sectionRef} className="rounded-xl border border-border/40 bg-card/10 p-3 transition-[border-color,background-color] duration-200 hover:border-border/85">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground/90 transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-md outline-none"
      >
        <span className="text-muted-foreground/70 transition-transform duration-200">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-90")} />
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span>{title}</span>
        {badge && (
          <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-secondary-foreground">
            {badge}
          </span>
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100 mt-3 scale-y-100" : "grid-rows-[0fr] opacity-0 pointer-events-none scale-y-95"
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 pb-1">{children}</div>
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
      timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!shouldRender) return null;

  const active = show && isAnimatingIn;

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-in-out",
        active
          ? "grid-rows-[1fr] opacity-100 scale-y-100"
          : "grid-rows-[0fr] opacity-0 scale-y-95 pointer-events-none"
      )}
      style={{ transitionDelay: active ? `${delay}ms` : "0ms" }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

interface HiddenTreeNode {
  node: FewerNode;
  children: HiddenTreeNode[];
}

/**
 * Build a recursive tree of hidden nodes. Each root is a hidden node whose
 * parent is not hidden; descendants are hidden children of that node.
 */
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
    if (parentId && idSet.has(parentId)) continue; // handled by its parent
    roots.push(build(id));
  }

  return roots;
}

/**
 * Recursive row for the Hidden Nodes section. Folders with hidden children
 * expand to reveal the full nested tree.
 */
function HiddenNodeRow({ tree, depth = 0 }: { tree: HiddenTreeNode; depth?: number }) {
  const renamingId = useGraphStore((s) => s.renamingId);
  const renameNode = useGraphStore((s) => s.renameNode);
  const showAncestors = useGraphStore((s) => s.showAncestors);
  const { toast } = useToast();
  const [open, setOpen] = useState(depth === 0);
  const isFolder = tree.node.data.type === "folder";
  const unreveal = (id: string) => {
    if (isFolder) {
      // Reveal subtree but protect the revealed root from being re-hidden by cascade
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
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-muted/50">
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/15 hover:text-foreground cursor-pointer"
            title={open ? "Collapse" : "Expand"}
            aria-label={open ? "Collapse" : "Expand"}
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            node.data.type === "folder" ? "bg-brand-orange" : "bg-brand-purple",
          )}
        />
        {renamingId === node.id ? (
          <RenameInput
            initialValue={node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label}
            onCommit={(v) => renameNode(node.id, v)}
            onCancel={() => useGraphStore.getState().setRenamingId(null)}
          />
        ) : (
          <span className="truncate text-foreground/90">{node.data.label}</span>
        )}
        <button
          onClick={() => unreveal(node.id)}
          className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-foreground/15 hover:text-foreground cursor-pointer"
          title={isFolder ? "Show folder and its children" : "Show this item"}
          aria-label={isFolder ? "Show subtree" : "Show item"}
        >
          <Eye className="h-3 w-3" />
        </button>
      </div>
      {open && hasChildren && (
        <div className="ml-3 pl-3 border-l border-border/30 space-y-0.5">
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
  const showAncestors = useGraphStore((s) => s.showAncestors);
  const maxDisplayDepth = useGraphStore((s) => s.maxDisplayDepth);
  const setMaxDisplayDepth = useGraphStore((s) => s.setMaxDisplayDepth);
  const autoHideThreshold = useGraphStore((s) => s.autoHideThreshold);
  const setAutoHideThreshold = useGraphStore((s) => s.setAutoHideThreshold);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  const hiddenPanelExpandTrigger = useGraphStore((s) => s.hiddenPanelExpandTrigger);
  const renamingId = useGraphStore((s) => s.renamingId);
  const renameNode = useGraphStore((s) => s.renameNode);

  const hiddenTree = useMemo(
    () => getHiddenLayerData(nodes, edges, hiddenIds),
    [nodes, edges, hiddenIds],
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Sanitization side-effect when switching from advanced to basic view
  useEffect(() => {
    if (!advancedModeEnabled) {
      // Reset direction to fallback if set to BT or RL
      if (direction === "BT" || direction === "RL") {
        setDirection("TB");
      }
    }
  }, [advancedModeEnabled, direction, setDirection]);

  const availableEdgeStyles = useMemo(() => {
    return [
      { value: "curved" as EdgeStyle, label: "Curved" },
      { value: "straight" as EdgeStyle, label: "Straight" },
      { value: "angled" as EdgeStyle, label: "Angled" },
    ];
  }, []);

  const availableStrokeStyles = useMemo(() => {
    const list: { value: EdgeStrokeStyle; label: string }[] = [];
    if (!edgeAnimated) {
      list.push({ value: "solid", label: "Lines" });
    }
    list.push({ value: "dashed", label: "Dashed" });
    list.push({ value: "dotted", label: "Dotted" });
    return list;
  }, [edgeAnimated]);

  return (
    <aside className="gm-glass flex h-full w-full flex-col justify-between overflow-hidden border-r border-border/30 p-4">
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 gm-scroll">
        
        {/* ── FILE & CANVAS MANAGEMENT ── */}
        <CollapsibleSection title="File & Actions" icon={HardDrive} defaultOpen>
          <div className="space-y-3">
            <Button
              variant="default"
              size="default"
              className="w-full gap-2 text-sm font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm shadow-orange-500/10 active:scale-[0.96] transition-[transform]"
              onClick={onOpenDirectory}
            >
              <FolderOpen className="h-4 w-4" />
              Import Folder
            </Button>
            
            <AnimatedConditional show={advancedModeEnabled} delay={0}>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="default"
                  className="w-full gap-2 border-border/80 hover:bg-muted/50 text-xs font-normal text-foreground"
                  onClick={onImportFromFile}
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  Import from File
                </Button>
              <Button
                variant="outline"
                size="default"
                className="w-full gap-2 border-border/80 hover:bg-muted/50 text-xs font-normal text-foreground"
                onClick={onImportFromUrl}
              >
                <Globe className="h-4 w-4 text-muted-foreground" />
                Import from URL
              </Button>
              </div>
            </AnimatedConditional>
            
            <div className={cn("grid gap-2", advancedModeEnabled ? "grid-cols-2" : "grid-cols-1")}>
              <Button
                variant="outline"
                size="default"
                className="w-full gap-1.5 text-xs font-normal text-foreground"
                onClick={() => {
                  const selectedFolderId = selectedNodeIds.length === 1
                    ? nodes.find((n) => n.id === selectedNodeIds[0] && n.data.type === "folder")?.id
                    : undefined;
                  const newId = selectedFolderId
                    ? useGraphStore.getState().addNode(selectedFolderId, "new-file.txt", "file")
                    : useGraphStore.getState().addStandaloneNode("new-file.txt", "file", { x: 1000, y: 600 });
                  useGraphStore.getState().setRenamingId(newId);
                  useGraphStore.getState().setZoomToNode(newId);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                Add File
              </Button>
              <Button
                variant="outline"
                size="default"
                className="w-full gap-1.5 text-xs font-normal text-foreground"
                onClick={() => {
                  const selectedFolderId = selectedNodeIds.length === 1
                    ? nodes.find((n) => n.id === selectedNodeIds[0] && n.data.type === "folder")?.id
                    : undefined;
                  const newId = selectedFolderId
                    ? useGraphStore.getState().addNode(selectedFolderId, "New Folder", "folder")
                    : useGraphStore.getState().addStandaloneNode("New Folder", "folder", { x: 1000, y: 600 });
                  useGraphStore.getState().setRenamingId(newId);
                  useGraphStore.getState().setZoomToNode(newId);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                Add Folder
              </Button>
            </div>
            
            <Button
              variant="ghost"
              size="default"
              className="w-full justify-center items-center gap-2 text-xs font-normal text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => setResetConfirmOpen(true)}
              disabled={nodes.length === 0}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>Clear Canvas</span>
            </Button>
          </div>
        </CollapsibleSection>

        {/* ── DESIGN & LAYOUT CONFIGURATION ── */}
        <CollapsibleSection title="Layout & Edges" icon={SlidersHorizontal} defaultOpen>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {BASIC_LAYOUTS.map((l) => {
                  const Icon = l.icon;
                  const active = direction === l.value;
                  return (
                    <button
                      key={l.value}
                      onClick={() => setDirection(l.value)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 transition-[border-color,background-color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300 shadow-sm"
                          : "border-border/60 hover:border-border hover:bg-muted/30 text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 opacity-80" />
                      <span className="text-xs font-normal">{l.label}</span>
                    </button>
                  );
                })}
              </div>

              <AnimatedConditional show={advancedModeEnabled} delay={50}>
                <div className="grid grid-cols-2 gap-2">
                  {ADVANCED_LAYOUTS.map((l) => {
                    const Icon = l.icon;
                    const active = direction === l.value;
                    return (
                      <button
                        key={l.value}
                        onClick={() => setDirection(l.value)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 transition-[border-color,background-color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300 shadow-sm"
                            : "border-border/60 hover:border-border hover:bg-muted/30 text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 opacity-80" />
                        <span className="text-xs font-normal">{l.label}</span>
                      </button>
                    );
                  })}
                </div>
              </AnimatedConditional>
            </div>

            <div className="space-y-2 rounded-xl border border-border/40 bg-muted/25 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                  Max Display Depth
                </Label>
                <span className="text-xs font-mono font-medium text-foreground/80">
                  {maxDisplayDepth === 0 ? "Unlimited" : `${maxDisplayDepth} levels`}
                </span>
              </div>
              <Slider
                value={[maxDisplayDepth]}
                onValueChange={([v]) => setMaxDisplayDepth(v)}
                min={1}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground leading-normal">
                Hide nodes deeper than this level. Folders beyond it appear in Hidden Nodes.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-border/40 bg-muted/25 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                  Auto-hide children
                </Label>
                <span className="text-xs font-mono font-medium text-foreground/80">
                 {autoHideThreshold}
                </span>
              </div>
              <Slider
                value={[autoHideThreshold]}
                onValueChange={([v]) => setAutoHideThreshold(v)}
                min={2}
                max={100}
                step={1}
              />
              <p className="text-xs text-muted-foreground leading-normal">
                Hide children of folders with more than this many items.
              </p>
            </div>

            <Button
              variant="outline"
              size="default"
              className="w-full gap-2 border-border/80 hover:bg-muted/40 text-xs font-normal text-foreground"
              onClick={() => {
                relayout();
                toast({ title: "Graph rearranged" });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Beautify Arrangement
            </Button>

            <div className="space-y-2 pt-1">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                Edge Flow Style
              </Label>
              <div className={cn(
                "grid gap-2",
                availableEdgeStyles.length === 3 ? "grid-cols-3" : "grid-cols-2"
              )}>
                {availableEdgeStyles.map((s) => {
                  const active = edgeStyle === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setEdgeStyle(s.value)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs font-normal text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300"
                          : "border-border/60 hover:bg-muted/40 text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {advancedModeEnabled && edgeStyle === "angled" && (
                <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3 mt-2 transition-all pb-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground font-normal">Corner radius</Label>
                    <span className="text-xs font-mono tabular-nums font-normal text-foreground/80">{cornerRadius}px</span>
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

              <AnimatedConditional show={advancedModeEnabled} delay={100}>
                <div className="space-y-3 pt-3 border-t border-border/30 mt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                      Edge Motion
                    </Label>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/50 p-0.5 bg-muted/20">
                      <button
                        onClick={() => setEdgeAnimated(false)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                          !edgeAnimated
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Static
                      </button>
                      <button
                        onClick={() => setEdgeAnimated(true)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                          edgeAnimated
                            ? "bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-300 shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Animated
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                      Stroke Pattern
                    </Label>
                    <div className={cn("grid gap-2", availableStrokeStyles.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                      {availableStrokeStyles.map((s) => {
                        const active = edgeStrokeStyle === s.value;
                        return (
                          <button
                            key={s.value}
                            onClick={() => setEdgeStrokeStyle(s.value)}
                            className={cn(
                              "rounded-lg border px-2 py-1.5 text-xs font-normal text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              active
                                ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300"
                                : "border-border/60 hover:bg-muted/40 text-foreground",
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 pb-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
                        Line Weight
                      </Label>
                      <span className="text-xs font-mono tabular-nums font-normal text-foreground/80">{edgeWidth}px</span>
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
          </div>
        </CollapsibleSection>

        {/* ── VISUAL STYLES & SKIN ── */}
        <CollapsibleSection title="Appearance" icon={Palette}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-xl border border-border/40 p-3.5 hover:border-border/80 bg-card/10 transition-colors">
              <div className="flex items-center gap-3">
                <FileIcon className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                <div className="space-y-0.5">
                  <Label htmlFor="show-files" className="text-xs font-medium cursor-pointer">
                    Show files
                  </Label>
                </div>
              </div>
              <Switch
                id="show-files"
                checked={showFiles}
                onCheckedChange={setShowFiles}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* ── RECOVER HIDDEN ELEMENTS (Recursive tree) ── */}
        {hiddenIds.length > 0 && (
          <CollapsibleSection title="Hidden Nodes" icon={EyeOff} badge={String(hiddenIds.length)} forceOpen={hiddenPanelExpandTrigger}>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-border/80 hover:bg-muted/40 text-xs font-normal text-foreground mb-2"
              onClick={() => { showAll(); setShowFiles(true); }}
            >
              <Eye className="h-3.5 w-3.5" />
              Show All
            </Button>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-border/30 bg-muted/20 p-2 gm-scroll">
              {hiddenTree.map((root) => (
                <HiddenNodeRow key={root.node.id} tree={root} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ── SYSTEM DATA METRICS ── */}
        <AnimatedConditional show={advancedModeEnabled && nodes.length > 0} delay={200}>
          <CollapsibleSection
            title="Graph Analytics"
            icon={Layers}
          >
            <StatsPanel />
          </CollapsibleSection>
        </AnimatedConditional>

      </div>

      {/* Persistent Info Footer Deck */}
      <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
        <div className="rounded-xl border border-border/40 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground hidden sm:block">
          <span className="font-semibold text-foreground/90 tracking-widest text-[10px] uppercase block mb-1">Canvas Shortcuts</span>{" "}
          Ctrl + I for more shortcuts • Arrow keys to navigate on canvas • <kbd className="px-1.5 py-0.5 bg-muted border border-border/80 rounded font-mono text-[9px] text-foreground/80 font-normal">H</kbd> to hide • <kbd className="px-1.5 py-0.5 bg-muted border border-border/80 rounded font-mono text-[9px] text-foreground/80 font-normal">Space</kbd> to fit graph to view
        </div>
      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-medium">Clear the entire canvas?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-normal">
              This will remove all {nodes.length} node
              {nodes.length === 1 ? "" : "s"} and{" "}
              {useGraphStore.getState().edges.length} edge
              {useGraphStore.getState().edges.length === 1 ? "" : "s"} from the
              canvas. This action cannot be undone with Ctrl+Z.
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
              Clear canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}