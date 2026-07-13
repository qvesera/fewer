"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import type { LayoutDirection, EdgeStyle, ThemeMode } from "@/lib/fewer/types";
import { StatsPanel, CustomThemeEditor } from ".";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const LAYOUTS: {
  value: LayoutDirection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "TB", label: "Top → Bottom", icon: ArrowDownToLine },
  { value: "LR", label: "Left → Right", icon: ArrowRightFromLine },
  { value: "BT", label: "Bottom → Top", icon: ArrowUpFromLine },
  { value: "RL", label: "Right → Left", icon: ArrowLeftToLine },
];

const EDGE_STYLES: { value: EdgeStyle; label: string }[] = [
  { value: "curved", label: "Curved" },
  { value: "angled", label: "Angled" },
  { value: "straight", label: "Straight" },
];

interface SidebarProps {
  onOpenDirectory: () => void;
  onImportFromFile: () => void;
}

/**
 * Collapsible section wrapper — keeps the sidebar compact and lets users
 * focus on the section they're working with.
 */
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
    <section>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Icon className="h-3 w-3 shrink-0" />
        <span className="font-medium">{title}</span>
        {badge && (
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-foreground/60">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
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
  const addNode = useGraphStore((s) => s.addNode);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const unhideAll = useGraphStore((s) => s.unhideAll);
  const unhideNode = useGraphStore((s) => s.unhideNode);
  const themeMode = useGraphStore((s) => s.themeMode);
  const setThemeMode = useGraphStore((s) => s.setThemeMode);

  const hiddenNodes = useMemo(
    () => nodes.filter((n) => hiddenIds.includes(n.id)),
    [nodes, hiddenIds],
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  return (
    <aside className="gm-glass flex h-full w-full flex-col gap-1 overflow-y-auto border-r border-border/30 p-3">
      {/* ── FILE ── Primary actions, always visible */}
      <CollapsibleSection title="File" icon={HardDrive} defaultOpen>
        <div className="space-y-2">
          <Button
            variant="default"
            size="sm"
            className="w-full gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
            onClick={onOpenDirectory}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Import Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={onImportFromFile}
          >
            <Upload className="h-3.5 w-3.5" />
            Import from File
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("fewer-add-node-standalone"),
                )
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Node
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("fewer-add-node"))
              }
              disabled={
                nodes.length === 0 ||
                selectedNodeIds.length === 0 ||
                nodes.find((n) => n.id === selectedNodeIds[0])?.data.type ===
                  "file"
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Child
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={() => setResetConfirmOpen(true)}
            disabled={nodes.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Canvas
          </Button>
        </div>
      </CollapsibleSection>

      <div className="h-px bg-border/40 my-1" />

      {/* ── LAYOUT ── Direction + Beautify + Advanced edge/size settings */}
      <CollapsibleSection title="Layout" icon={SlidersHorizontal} defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((l) => {
            const Icon = l.icon;
            const active = direction === l.value;
            return (
              <button
                key={l.value}
                onClick={() => setDirection(l.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-all",
                  active
                    ? "border-orange-400 bg-orange-500/10 text-orange-300 shadow-sm shadow-orange-500/20"
                    : "border-border/40 hover:border-border hover:bg-muted/40",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[9px] font-medium">{l.label}</span>
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => relayout()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Beautify Layout
        </Button>

        {/* Edge style + node size sub-section */}
        <div className="space-y-3 rounded-lg border border-border/40 bg-card/40 p-3">
          <div className="space-y-1.5">
            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Edge style
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {EDGE_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setEdgeStyle(s.value)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px] font-medium transition-all",
                    edgeStyle === s.value
                      ? "border-purple-400 bg-purple-500/10 text-purple-300"
                      : "border-border/40 hover:bg-muted/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {edgeStyle === "angled" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Corner radius
                </Label>
                <span className="text-[9px] text-muted-foreground">
                  {cornerRadius}px
                </span>
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
          <div className="space-y-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Node width
                </Label>
                <span className="text-[9px] text-muted-foreground">
                  {nodeWidth}px
                </span>
              </div>
              <Slider
                value={[nodeWidth]}
                onValueChange={([v]) => setNodeDimensions(v, nodeHeight)}
                min={120}
                max={400}
                step={10}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Node height (folders)
                </Label>
                <span className="text-[9px] text-muted-foreground">
                  {nodeHeight}px
                </span>
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
        </div>
      </CollapsibleSection>

      <div className="h-px bg-border/40 my-1" />

      {/* ── APPEARANCE ── Theme + Custom colors */}
      <CollapsibleSection title="Appearance" icon={Palette}>
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "custom"] as ThemeMode[]).map((mode) => {
            const Icon =
              mode === "light" ? Sun : mode === "dark" ? Moon : Palette;
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2 transition-all",
                  active
                    ? "border-purple-400 bg-purple-500/10 text-purple-300"
                    : "border-border/40 hover:bg-muted/40",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[9px] font-medium capitalize">
                  {mode}
                </span>
              </button>
            );
          })}
        </div>
        {themeMode === "custom" && <CustomThemeEditor />}
      </CollapsibleSection>

      {/* ── HIDDEN NODES ── Only shows when there are hidden nodes */}
      {hiddenIds.length > 0 && (
        <>
          <div className="h-px bg-border/40 my-1" />
          <CollapsibleSection
            title="Hidden"
            icon={EyeOff}
            badge={String(hiddenIds.length)}
          >
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-card/40 p-1.5">
              {hiddenNodes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      n.data.type === "folder"
                        ? "bg-orange-400"
                        : "bg-purple-400",
                    )}
                  />
                  <span className="truncate text-foreground/80">
                    {n.data.label}
                  </span>
                  <button
                    onClick={() => unhideNode(n.id)}
                    className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    title="Unhide"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => unhideAll()}
            >
              <Eye className="h-3.5 w-3.5" />
              Unhide All
            </Button>
          </CollapsibleSection>
        </>
      )}

      <div className="h-px bg-border/40 my-1" />

      {/* ── STATISTICS ── Collapsed by default to save space */}
      <CollapsibleSection
        title="Statistics"
        icon={Layers}
        badge={nodes.length > 0 ? String(nodes.length) : undefined}
      >
        <StatsPanel />
      </CollapsibleSection>

      {/* Tips at the bottom, minimal */}
      <div className="mt-auto rounded-xl border border-border/40 bg-muted/30 p-2.5 text-[9px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/80">Tips:</span>{" "}
        Right-click nodes for actions · Arrow keys to navigate · H to hide ·
        Shift+H to unhide · Ctrl+F to search · Space to fit view
      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the entire canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {nodes.length} node
              {nodes.length === 1 ? "" : "s"} and{" "}
              {useGraphStore.getState().edges.length} edge
              {useGraphStore.getState().edges.length === 1 ? "" : "s"} from the
              canvas. This action can be undone with Ctrl+Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reset();
                setResetConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
