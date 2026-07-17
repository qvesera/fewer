"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  FileImage,
  FileJson,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileTerminal,
  FolderTree,
  Download,
  MousePointerClick,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { exportGraph } from "@/lib/fewer/exportUtils";
import {
  exportDirectoryScript,
  exportDirectoryTree,
} from "@/lib/fewer/scriptExport";
import { computeStats } from "@/lib/fewer/stats";
import { getDescendants } from "@/lib/fewer/validation";
import type { ExportSettings } from "@/lib/fewer/types";
import { cn } from "@/lib/utils";

const BASIC_FORMATS: {
  value: ExportSettings["format"];
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "png", label: "PNG Image", desc: "Raster graphics format with transparency support", icon: FileImage },
  {
    value: "tree",
    label: "Directory Tree",
    desc: "Generate a Unicode ASCII directory tree (.txt)",
    icon: FolderTree,
  },
];

const ADVANCED_FORMATS: {
  value: ExportSettings["format"];
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "svg", label: "SVG Vector", desc: "Scalable vector graphics formatting", icon: FileCode },
  { value: "json", label: "JSON Graph State", desc: "Export raw graph nodes and edges array", icon: FileJson },
  { value: "csv", label: "CSV Tabular", desc: "Spreadsheet friendly node and relationship data", icon: FileSpreadsheet },
  { value: "dot", label: "Graphviz DOT", desc: "Compatible format for Graphviz software engines", icon: FileText },
  {
    value: "script",
    label: "Shell Creation Script",
    desc: "Generate active mkdir commands (.sh / .bat)",
    icon: FileTerminal,
  },
];

export function ExportPanel() {
  const open = useGraphStore((s) => s.exportOpen);
  const setOpen = useGraphStore((s) => s.setExportOpen);
  const settings = useGraphStore((s) => s.exportSettings);
  const setSettings = useGraphStore((s) => s.setExportSettings);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const [exportSelected, setExportSelected] = useState(false);

  const formats = advancedModeEnabled
    ? [...BASIC_FORMATS, ...ADVANCED_FORMATS]
    : BASIC_FORMATS;

  useEffect(() => {
    if (!advancedModeEnabled) {
      const isAdvancedFormat = ADVANCED_FORMATS.some(
        (f) => f.value === settings.format
      );
      if (isAdvancedFormat) {
        setSettings({ format: "png" });
      }
    }
  }, [advancedModeEnabled, settings.format, setSettings]);

  const { exportNodes, exportEdges } = useMemo(() => {
    if (!exportSelected || selectedNodeIds.length === 0) {
      return { exportNodes: nodes, exportEdges: edges };
    }
    const subgraphIds = new Set<string>();
    for (const selectedId of selectedNodeIds) {
      subgraphIds.add(selectedId);
      const descendants = getDescendants(selectedId, edges);
      for (const d of descendants) {
        subgraphIds.add(d);
      }
    }
    const subNodes = nodes.filter((n) => subgraphIds.has(n.id));
    const subEdges = edges.filter(
      (e) => subgraphIds.has(e.source) && subgraphIds.has(e.target),
    );
    return { exportNodes: subNodes, exportEdges: subEdges };
  }, [exportSelected, selectedNodeIds, nodes, edges]);

  const handleExport = () => {
    const nodesToExport = exportNodes;
    const edgesToExport = exportEdges;

    if (settings.format === "script") {
      exportDirectoryScript(nodesToExport, edgesToExport);
    } else if (settings.format === "tree") {
      exportDirectoryTree(nodesToExport, edgesToExport);
    } else {
      const stats = computeStats(nodesToExport, edgesToExport);
      exportGraph(nodesToExport, edgesToExport, settings, stats);
    }
    setOpen(false);
  };

  const isRaster = settings.format === "png";
  const canExportSelected = selectedNodeIds.length > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto gm-scroll bg-background/95 backdrop-blur-md border-l border-border/40 p-6">
        <SheetHeader className="space-y-2">
          <SheetTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Download className="h-5 w-5 text-muted-foreground/85" />
            Export Graph Canvas
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed font-normal">
            Select your preferred export format and options below. The generated file directly captures current workspace layouts, visual overrides, and asset visibility changes.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Format Engine</Label>
            <div className="grid grid-cols-1 gap-2">
              {formats.map((f) => {
                const Icon = f.icon;
                const active = settings.format === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setSettings({ format: f.value })}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300 shadow-sm shadow-purple-500/5"
                        : "border-border/50 hover:border-border hover:bg-muted/30 text-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground/70"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold tracking-tight">{f.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {f.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/10 p-3.5 hover:border-border/80 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <MousePointerClick className="h-4 w-4 text-muted-foreground/85 shrink-0" />
              <div className="min-w-0">
                <Label className="text-xs font-semibold">Export Selection Only</Label>
                <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5">
                  {canExportSelected
                    ? `Bounding ${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? "" : "s"} & subtrees`
                    : "Select canvas nodes first to isolate"}
                </p>
              </div>
            </div>
            <Switch
              checked={exportSelected && canExportSelected}
              onCheckedChange={(v) => setExportSelected(v)}
              disabled={!canExportSelected}
            />
          </div>

          {isRaster && (
            <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4 transition-all">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Export Resolution Quality</Label>
                <span className="text-xs font-mono font-semibold text-foreground/80">{settings.quality}%</span>
              </div>
              <Slider
                value={[settings.quality]}
                onValueChange={([v]) => setSettings({ quality: v })}
                min={10}
                max={100}
                step={5}
              />
            </div>
          )}

          {(settings.format === "png" || settings.format === "svg") && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/10 p-3.5 hover:border-border/80 transition-colors">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Transparent Canvas Background</Label>
                <p className="text-xs text-muted-foreground">
                  Strips default workspace thematic backdrop fills.
                </p>
              </div>
              <Switch
                checked={settings.transparentBackground}
                onCheckedChange={(v) =>
                  setSettings({ transparentBackground: v })
                }
              />
            </div>
          )}

          {settings.format === "json" && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/10 p-3.5 hover:border-border/80 transition-colors">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Include Structural Metrics</Label>
                <p className="text-xs text-muted-foreground">
                  Appends layout and file analyzer calculations into the JSON.
                </p>
              </div>
              <Switch
                checked={settings.includeStats}
                onCheckedChange={(v) => setSettings({ includeStats: v })}
              />
            </div>
          )}

          <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs text-muted-foreground space-y-2">
            <span className="font-bold text-foreground/90 tracking-wider text-[10px] uppercase block mb-1">Export Config Snapshot</span>
            <div className="flex items-center justify-between border-b border-border/10 pb-1.5">
              <span>Target Assets</span>
              <span className="font-mono text-foreground/90 font-semibold">
                {exportSelected && canExportSelected
                  ? `${exportNodes.length} nodes`
                  : `${nodes.length} nodes`}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border/10 pb-1.5">
              <span>Interconnections</span>
              <span className="font-mono text-foreground/90 font-semibold">
                {exportSelected && canExportSelected
                  ? `${exportEdges.length} edges`
                  : `${edges.length} edges`}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border/10 pb-1.5">
              <span>Scope Boundary</span>
              <span className="text-foreground/90 font-medium">
                {exportSelected && canExportSelected ? "Isolated Selected Subtree" : "Full Workspace Canvas"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Selected Format</span>
              <span className="uppercase font-mono font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-[10px]">{settings.format}</span>
            </div>
          </div>

          <Button
            className="w-full gap-2 text-sm font-semibold bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white hover:from-purple-600 hover:to-fuchsia-600 shadow-sm active:scale-[0.99] transition-all h-11"
            onClick={handleExport}
            disabled={nodes.length === 0}
          >
            <Download className="h-4.5 w-4.5" />
            Download {settings.format.toUpperCase()} File
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}