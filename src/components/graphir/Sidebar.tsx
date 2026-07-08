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
  FolderPlus,
  Trash2,
  Layers,
  Plus,
  EyeOff,
  Eye,
  ChevronDown,
  ChevronRight,
  Settings2,
  Sun,
  Moon,
  Palette,
} from "lucide-react";
import type { LayoutDirection, EdgeStyle, ThemeMode } from "@/lib/graphir/types";
import { StatsPanel } from "./StatsPanel";
import { CustomThemeEditor } from "./CustomThemeEditor";
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
}

export function Sidebar({ onOpenDirectory }: SidebarProps) {
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setCornerRadius = useGraphStore((s) => s.setCornerRadius);
  const nodeWidth = useGraphStore((s) => s.nodeWidth);
  const nodeHeight = useGraphStore((s) => s.nodeHeight);
  const setNodeDimensions = useGraphStore((s) => s.setNodeDimensions);
  const advancedOpen = useGraphStore((s) => s.advancedOpen);
  const setAdvancedOpen = useGraphStore((s) => s.setAdvancedOpen);
  const relayout = useGraphStore((s) => s.relayout);
  const reset = useGraphStore((s) => s.reset);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
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
    [nodes, hiddenIds]
  );

  const [addOpen, setAddOpen] = useState(false);
  const [addStandaloneOpen, setAddStandaloneOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"folder" | "file">("file");
  const [standaloneName, setStandaloneName] = useState("");
  const [standaloneType, setStandaloneType] = useState<"folder" | "file">("folder");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  const handleUpdateDirectory = async () => {
    setUpdating(true);
    try {
      const { getStoredRootHandle, updateDirectoryOnDisk } = await import("@/lib/graphir/fileSystem");
      const rootHandle = getStoredRootHandle();
      if (!rootHandle) {
        setUpdateConfirmOpen(false);
        setUpdating(false);
        return;
      }
      const result = await updateDirectoryOnDisk(rootHandle, nodes, edges);
      setUpdateConfirmOpen(false);
      const { toast } = await import("@/hooks/use-toast");
      toast().toast({
        title: "Directory updated",
        description: `${result.created.length} created, ${result.skipped.length} already existed${result.failed.length ? `, ${result.failed.length} failed` : ""}`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast().toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-r border-border/40 bg-card/40 p-3 backdrop-blur-xl">
      <section>
        <Label className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Layout direction
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((l) => {
            const Icon = l.icon;
            const active = direction === l.value;
            return (
              <button
                key={l.value}
                onClick={() => setDirection(l.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-3 transition-all",
                  active
                    ? "border-orange-400 bg-orange-500/10 text-orange-300 shadow-md shadow-orange-500/20"
                    : "border-border/40 hover:border-border hover:bg-muted/40"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{l.label}</span>
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full gap-1.5"
          onClick={() => relayout()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Beautify Layout
        </Button>
      </section>

      {/* Advanced panel */}
      <section>
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {advancedOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <Settings2 className="h-3 w-3" />
          Advanced
        </button>
        {advancedOpen && (
          <div className="mt-2 space-y-3 rounded-lg border border-border/40 bg-card/40 p-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
                        : "border-border/40 hover:bg-muted/40"
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
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Corner radius
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
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
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Node width
                  </Label>
                  <span className="text-[10px] text-muted-foreground">{nodeWidth}px</span>
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
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Node height
                  </Label>
                  <span className="text-[10px] text-muted-foreground">{nodeHeight}px</span>
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
        )}
      </section>

      <div className="h-px bg-border/40" />

      <section>
        <Label className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Directory
        </Label>
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
            onClick={() => setUpdateConfirmOpen(true)}
            disabled={nodes.length === 0}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Update Directory
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => setAddStandaloneOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Node
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => setAddOpen(true)}
            disabled={nodes.length === 0 || selectedNodeIds.length === 0}
          >
            <Plus className="h-3.5 w-3.5" />
            Add child node
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={() => setResetConfirmOpen(true)}
            disabled={nodes.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear canvas
          </Button>
        </div>
      </section>

      <div className="h-px bg-border/40" />

      {/* Theme & Layout section */}
      <section>
        <Label className="mb-2 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Theme
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "custom"] as ThemeMode[]).map((mode) => {
            const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Palette;
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2 transition-all",
                  active
                    ? "border-purple-400 bg-purple-500/10 text-purple-300"
                    : "border-border/40 hover:bg-muted/40"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium capitalize">{mode}</span>
              </button>
            );
          })}
        </div>
        {themeMode === "custom" && (
          <div className="mt-3">
            <CustomThemeEditor />
          </div>
        )}
      </section>

      <div className="h-px bg-border/40" />

      {hiddenIds.length > 0 && (
        <section>
          <Label className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <EyeOff className="h-3 w-3" /> Hidden ({hiddenIds.length})
          </Label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-card/40 p-1.5">
            {hiddenNodes.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    n.data.type === "folder" ? "bg-orange-400" : "bg-purple-400"
                  )}
                />
                <span className="truncate text-foreground/80">{n.data.label}</span>
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
            className="mt-2 w-full gap-1.5"
            onClick={() => unhideAll()}
          >
            <Eye className="h-3.5 w-3.5" />
            Unhide all
          </Button>
        </section>
      )}

      <div className="h-px bg-border/40" />

      <section>
        <Label className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3 w-3" /> Statistics
        </Label>
        <StatsPanel />
      </section>

      <div className="mt-auto rounded-xl border border-border/40 bg-muted/30 p-3 text-[10px] leading-relaxed text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">Tips</div>
        Drag nodes anywhere · right-click for context menus · Ctrl+Click to multi-select ·
        Ctrl+F to search · Space to fit view.
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new node</DialogTitle>
            <DialogDescription>
              Adds a new node as a child of the currently selected node.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Name</Label>
              <input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. notes.md"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewType("file")}
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    newType === "file"
                      ? "border-purple-400 bg-purple-500/10"
                      : "border-border/40"
                  )}
                >
                  📄 File
                </button>
                <button
                  onClick={() => setNewType("folder")}
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    newType === "folder"
                      ? "border-orange-400 bg-orange-500/10"
                      : "border-border/40"
                  )}
                >
                  📁 Folder
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newName.trim()) return;
                addNode(selectedNodeIds[0] ?? null, newName.trim(), newType);
                setNewName("");
                setNewType("file");
                setAddOpen(false);
              }}
              className="bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white"
            >
              Add node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standalone Add Node dialog */}
      <Dialog open={addStandaloneOpen} onOpenChange={setAddStandaloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add standalone node</DialogTitle>
            <DialogDescription>
              Creates a new root node on the canvas. You can connect it to
              other nodes by dragging from a handle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="standalone-name">Name</Label>
              <input
                id="standalone-name"
                value={standaloneName}
                onChange={(e) => setStandaloneName(e.target.value)}
                placeholder="e.g. new-folder"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setStandaloneType("folder")}
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    standaloneType === "folder"
                      ? "border-orange-400 bg-orange-500/10"
                      : "border-border/40"
                  )}
                >
                  📁 Folder
                </button>
                <button
                  onClick={() => setStandaloneType("file")}
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    standaloneType === "file"
                      ? "border-purple-400 bg-purple-500/10"
                      : "border-border/40"
                  )}
                >
                  📄 File
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStandaloneOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const name = standaloneName.trim() || (standaloneType === "folder" ? "New Folder" : "new-file.txt");
                addStandaloneNode(name, standaloneType, { x: 1000, y: 600 });
                setStandaloneName("");
                setStandaloneType("folder");
                setAddStandaloneOpen(false);
              }}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white"
            >
              Create node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear canvas confirmation */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the entire canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {nodes.length} node
              {nodes.length === 1 ? "" : "s"} and {useGraphStore.getState().edges.length} edge
              {useGraphStore.getState().edges.length === 1 ? "" : "s"} from the canvas. This
              action can be undone with Ctrl+Z.
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

      {/* Update Directory confirmation */}
      <AlertDialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update directory on disk?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create all missing folders from your graph on the local file
              system inside the directory you imported. Existing folders will be skipped.
              This requires File System Access API permission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUpdateDirectory}
              disabled={updating}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
            >
              {updating ? "Creating…" : "Create folders"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
