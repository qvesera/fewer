"use client";

import { useState, useMemo } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { exportGraph } from "@/lib/graphir/exportUtils";
import {
  exportDirectoryScript,
  exportDirectoryTree,
} from "@/lib/graphir/scriptExport";
import { computeStats } from "@/lib/graphir/stats";
import { getDescendants } from "@/lib/graphir/validation";
import type { ExportSettings, GraphirNode, GraphirEdge } from "@/lib/graphir/types";

const FORMATS: {
  value: ExportSettings["format"];
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "svg", label: "SVG", desc: "Vector · scalable", icon: FileCode },
  { value: "png", label: "PNG", desc: "Raster · transparent", icon: FileImage },
  { value: "json", label: "JSON", desc: "Graph state", icon: FileJson },
  { value: "csv", label: "CSV", desc: "Tabular data", icon: FileSpreadsheet },
  { value: "dot", label: "DOT", desc: "Graphviz format", icon: FileText },
  { value: "script", label: "Dir Script", desc: "mkdir .sh / .bat", icon: FileTerminal },
  { value: "tree", label: "Dir Tree", desc: "Unicode ASCII tree .txt", icon: FolderTree },
];

export function ExportPanel() {
  const open = useGraphStore((s) => s.exportOpen);
  const setOpen = useGraphStore((s) => s.setExportOpen);
  const settings = useGraphStore((s) => s.exportSettings);
  const setSettings = useGraphStore((s) => s.setExportSettings);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const [exportSelected, setExportSelected] = useState(false);

  // Compute the subgraph (selected node + all descendants) when
  // exportSelected is enabled and at least one node is selected.
  const { exportNodes, exportEdges } = useMemo(() => {
    if (!exportSelected || selectedNodeIds.length === 0) {
      return { exportNodes: nodes, exportEdges: edges };
    }
    // Collect all descendant IDs for each selected node
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
      (e) => subgraphIds.has(e.source) && subgraphIds.has(e.target)
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
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export graph
          </SheetTitle>
          <SheetDescription>
            Choose a format and options. The exported file reflects the current
            canvas state including any edits.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="grid grid-cols-1 gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const active = settings.format === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setSettings({ format: f.value })}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-purple-400 bg-purple-500/10 shadow-md shadow-purple-500/20"
                        : "border-border/40 hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        active ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{f.label}</div>
                      <div className="text-[11px] text-muted-foreground">{f.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Export Selected toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border/40 p-3">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm">Export selected only</Label>
                <p className="text-[11px] text-muted-foreground">
                  {canExportSelected
                    ? `Exports ${selectedNodeIds.length} selected node${selectedNodeIds.length === 1 ? "" : "s"} and all descendants`
                    : "Select a node on the canvas first"}
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Quality</Label>
                <span className="text-xs text-muted-foreground">{settings.quality}%</span>
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
            <div className="flex items-center justify-between rounded-xl border border-border/40 p-3">
              <div>
                <Label className="text-sm">Transparent background</Label>
                <p className="text-[11px] text-muted-foreground">
                  Skip the canvas background fill.
                </p>
              </div>
              <Switch
                checked={settings.transparentBackground}
                onCheckedChange={(v) => setSettings({ transparentBackground: v })}
              />
            </div>
          )}

          {settings.format === "json" && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 p-3">
              <div>
                <Label className="text-sm">Include stats</Label>
                <p className="text-[11px] text-muted-foreground">
                  Append computed statistics to the JSON payload.
                </p>
              </div>
              <Switch
                checked={settings.includeStats}
                onCheckedChange={(v) => setSettings({ includeStats: v })}
              />
            </div>
          )}

          <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Export summary</div>
            <div className="mt-1 flex items-center justify-between">
              <span>Nodes</span>
              <span className="tabular-nums">
                {exportSelected && canExportSelected
                  ? `${exportNodes.length} (of ${nodes.length})`
                  : nodes.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Edges</span>
              <span className="tabular-nums">
                {exportSelected && canExportSelected
                  ? `${exportEdges.length} (of ${edges.length})`
                  : edges.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Scope</span>
              <span>{exportSelected && canExportSelected ? "Selected subtree" : "Full graph"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Format</span>
              <span className="uppercase">{settings.format}</span>
            </div>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white hover:from-purple-600 hover:to-fuchsia-600"
            onClick={handleExport}
            disabled={nodes.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Download {settings.format.toUpperCase()}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
