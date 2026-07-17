"use client";

import { useMemo, useState, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Palette,
  Layers,
  Settings2,
  HardDrive,
  SlidersHorizontal,
  Maximize2,
} from "lucide-react";
import type { LayoutDirection, EdgeStyle, ThemeMode } from "@/lib/fewer/types";
import { StatsPanel, CustomThemeEditor, PowerUserToggle } from ".";
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
}

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border/40 bg-card/10 p-3 transition-all duration-200 hover:border-border/85">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground/90 transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-md outline-none"
      >
        <span className="text-muted-foreground/70 transition-transform duration-200">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
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
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 pointer-events-none"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 pb-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Sidebar({ onOpenDirectory, onImportFromFile }: SidebarProps) {
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setCornerRadius = useGraphStore((s) => s.setCornerRadius);
  const nodeWidth = useGraphStore((s) => s.nodeWidth);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);
  const setNodeDimensions = useGraphStore((s) => s.setNodeDimensions);
  const relayout = useGraphStore((s) => s.relayout);
  const reset = useGraphStore((s) => s.reset);
  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const unhideAll = useGraphStore((s) => s.unhideAll);
  const unhideNode = useGraphStore((s) => s.unhideNode);
  const themeMode = useGraphStore((s) => s.themeMode);
  const setThemeMode = useGraphStore((s) => s.setThemeMode);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  const hiddenNodes = useMemo(
    () => nodes.filter((n) => hiddenIds.includes(n.id)),
    [nodes, hiddenIds],
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Sanitization side-effect when switching from advanced to basic view
  useEffect(() => {
    if (!advancedModeEnabled) {
      // 1. Reset edge style to fallback if it's set to "angled"
      if (edgeStyle === "angled") {
        setEdgeStyle("curved");
      }
      
      // 2. Reset direction to fallback if set to BT or RL
      if (direction === "BT" || direction === "RL") {
        setDirection("TB");
      }

      // 3. Reset layout theme mode if set to "custom"
      if (themeMode === "custom") {
        setThemeMode("dark");
      }
    }
  }, [advancedModeEnabled, edgeStyle, direction, themeMode, setEdgeStyle, setDirection, setThemeMode]);

  const availableEdgeStyles = useMemo(() => {
    const base = [
      { value: "curved" as EdgeStyle, label: "Curved" },
      { value: "straight" as EdgeStyle, label: "Straight" },
    ];
    if (advancedModeEnabled) {
      base.push({ value: "angled" as EdgeStyle, label: "Angled" });
    }
    return base;
  }, [advancedModeEnabled]);

  return (
    <aside className="gm-glass flex h-full w-full flex-col justify-between overflow-hidden border-r border-border/30 p-4">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1 gm-scroll">
        
        {/* ── FILE & CANVAS MANAGEMENT ── */}
        <CollapsibleSection title="File & Actions" icon={HardDrive} defaultOpen>
          <div className="space-y-3">
            <Button
              variant="default"
              size="default"
              className="w-full gap-2 text-sm font-medium bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm shadow-orange-500/10 active:scale-[0.99] transition-all"
              onClick={onOpenDirectory}
            >
              <FolderOpen className="h-4 w-4" />
              Import Folder
            </Button>
            
            {advancedModeEnabled && (
              <Button
                variant="outline"
                size="default"
                className="w-full gap-2 border-border/80 hover:bg-muted/50 text-xs font-normal text-foreground"
                onClick={onImportFromFile}
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                Import from File
              </Button>
            )}
            
            <div className={cn("grid gap-2", advancedModeEnabled ? "grid-cols-2" : "grid-cols-1")}>
              <Button
                variant="outline"
                size="default"
                className="w-full gap-1.5 text-xs font-normal text-foreground"
                onClick={() => window.dispatchEvent(new CustomEvent("fewer-add-node-standalone"))}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                Node
              </Button>
              {advancedModeEnabled && (
                <Button
                  variant="outline"
                  size="default"
                  className="w-full gap-1.5 text-xs font-normal text-foreground"
                  onClick={() => window.dispatchEvent(new CustomEvent("fewer-add-node"))}
                  disabled={
                    nodes.length === 0 ||
                    selectedNodeIds.length === 0 ||
                    nodes.find((n) => n.id === selectedNodeIds[0])?.data.type === "file"
                  }
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  Child
                </Button>
              )}
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {BASIC_LAYOUTS.map((l) => {
                const Icon = l.icon;
                const active = direction === l.value;
                return (
                  <button
                    key={l.value}
                    onClick={() => setDirection(l.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              {advancedModeEnabled && ADVANCED_LAYOUTS.map((l) => {
                const Icon = l.icon;
                const active = direction === l.value;
                return (
                  <button
                    key={l.value}
                    onClick={() => setDirection(l.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

            <Button
              variant="outline"
              size="default"
              className="w-full gap-2 border-border/80 hover:bg-muted/40 text-xs font-normal text-foreground"
              onClick={() => relayout()}
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
                <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3 mt-2 transition-all">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground font-normal">Corner radius</Label>
                    <span className="text-xs font-mono font-normal text-foreground/80">{cornerRadius}px</span>
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
            </div>
          </div>
        </CollapsibleSection>

        {/* ── POWER USER MODE ONLY: NODE DIMENSIONS DATA ── */}
        {advancedModeEnabled && (
          <CollapsibleSection title="Node Metrics" icon={Maximize2}>
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-normal">Node Width</Label>
                  <span className="text-xs font-mono font-normal text-foreground/80">{nodeWidth}px</span>
                </div>
                <Slider
                  value={[nodeWidth]}
                  onValueChange={([v]) => setNodeDimensions(v, nodeHeight)}
                  min={120}
                  max={400}
                  step={10}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-normal">Node Height</Label>
                  <span className="text-xs font-mono font-normal text-foreground/80">{nodeHeight}px</span>
                </div>
                <Slider
                  value={[nodeHeight]}
                  onValueChange={([v]) => setNodeDimensions(nodeWidth, v)}
                  min={40}
                  max={300}
                  step={5}
                />
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* ── VISUAL STYLES & SKIN ── */}
        <CollapsibleSection title="Appearance" icon={Palette}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(advancedModeEnabled ? (["light", "dark", "custom"] as ThemeMode[]) : (["light", "dark"] as ThemeMode[])).map((mode) => {
                const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Palette;
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 transition-all active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300"
                        : "border-border/60 hover:border-border hover:bg-muted/30 text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 opacity-80" />
                    <span className="text-xs font-normal capitalize">{mode}</span>
                  </button>
                );
              })}
            </div>
            {advancedModeEnabled && themeMode === "custom" && <CustomThemeEditor />}
          </div>
        </CollapsibleSection>

        {/* ── RECOVER HIDDEN ELEMENTS ── */}
        {hiddenIds.length > 0 && (
          <CollapsibleSection title="Hidden Layers" icon={EyeOff} badge={String(hiddenIds.length)}>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border/30 bg-muted/20 p-2 gm-scroll">
              {hiddenNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      n.data.type === "folder" ? "bg-brand-orange" : "bg-brand-purple",
                    )}
                  />
                  <span className="truncate text-foreground/90 font-normal text-xs">{n.data.label}</span>
                  <button
                    onClick={() => unhideNode(n.id)}
                    className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-foreground/15 hover:text-foreground"
                    title="Unhide Asset"
                    aria-label="Unhide node"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs mt-2 font-normal text-foreground"
              onClick={() => unhideAll()}
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              Unhide All Objects
            </Button>
          </CollapsibleSection>
        )}

        {/* ── SYSTEM DATA METRICS ── */}
        {advancedModeEnabled && (
          <CollapsibleSection
            title="Graph Analytics"
            icon={Layers}
            badge={nodes.length > 0 ? String(nodes.length) : undefined}
          >
            <StatsPanel />
          </CollapsibleSection>
        )}

        {/* ── PREFERENCES & SWITCHES ── */}
        <CollapsibleSection title="Configuration" icon={Settings2}>
          <PowerUserToggle />
        </CollapsibleSection>
      </div>

      {/* Persistent Info Footer Deck */}
      <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
        <div className="rounded-xl border border-border/40 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground/90 tracking-widest text-[10px] uppercase block mb-1">Canvas Shortcuts</span>{" "}
          Right-click nodes for parameters • Arrow keys to shift • <kbd className="px-1.5 py-0.5 bg-muted border border-border/80 rounded font-mono text-[9px] text-foreground/80 font-normal">H</kbd> to hide • <kbd className="px-1.5 py-0.5 bg-muted border border-border/80 rounded font-mono text-[9px] text-foreground/80 font-normal">Space</kbd> to fit zoom
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
              canvas. This action can be undone with Ctrl+Z.
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