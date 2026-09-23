"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { EditableNumber } from "@/components/ui/editable-number";
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
  ChevronRight,
  Info,
  Link,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGraphStore } from "@/store/graphStore";
import { useGraphData, useLayoutConfig, useUiState } from "@/store/hooks";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useActiveLeaf } from "@/hooks/use-active-leaf";
import {
  filterVisibleEdges,
  filterVisibleNodes,
} from "@/hooks/use-canvas-visible-graph";
import { exportGraph } from "@/lib/fewer/exportUtils";
import {
  exportDirectoryScript,
  exportDirectoryTree,
} from "@/lib/fewer/scriptExport";
import { computeStats } from "@/lib/fewer/stats";
import { getDescendants } from "@/lib/fewer/validation";
import { resolveViewNodes } from "@/lib/fewer/viewState";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { edgeDashPattern, edgeTypeFromStyle } from "@/lib/fewer/types";
import type { ExportSettings } from "@/lib/fewer/types";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/fewer/plural";
import { isSingleFileSelected, isAdvancedFormatOnly } from "@/lib/fewer/exportPanelModel";
import { can } from "@/lib/fewer/tiers";

const BASIC_FORMATS: {
  value: ExportSettings["format"];
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  info: string;
}[] = [
  { value: "png", label: "PNG", desc: "Image", icon: FileImage, info: "Best for sharing graphs in presentations, docs, or social media." },
  {
    value: "tree",
    label: "Directory Tree",
    desc: "ASCII tree (.txt)",
    icon: FolderTree,
    info: "Great for quick terminal output or embedding in code comments.",
  },
];

const ADVANCED_FORMATS: {
  value: ExportSettings["format"];
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  info: string;
}[] = [
  { value: "svg", label: "SVG", desc: "Vector", icon: FileCode, info: "Ideal for logos, print, or scaling without quality loss." },
  { value: "json", label: "JSON", desc: "Raw graph data", icon: FileJson, info: "Use for programmatic processing or importing into other tools." },
  { value: "csv", label: "CSV", desc: "Spreadsheet data", icon: FileSpreadsheet, info: "Best for opening in Excel, Google Sheets, or data analysis." },
  { value: "dot", label: "DOT", desc: "Graphviz format", icon: FileText, info: "Use with Graphviz tools for automatic graph layout." },
  {
    value: "script",
    label: "Shell Script",
    desc: "mkdir commands (.sh)",
    icon: FileTerminal,
    info: "Recreate your folder structure anywhere with a single script.",
  },
];

export function ExportPanel() {
  const open = useGraphStore((s) => s.exportOpen);
  const setOpen = useGraphStore((s) => s.setExportOpen);
  const settings = useGraphStore((s) => s.exportSettings);
  const setSettings = useGraphStore((s) => s.setExportSettings);
  const shynessScale = useGraphStore((s) => s.shynessScale);
  const sortKey = useGraphStore((s) => s.sortKey);
  const sortDir = useGraphStore((s) => s.sortDir);
  const tags = useGraphStore((s) => s.tags);
  const viewSettings = useGraphStore((s) => s.viewSettings);
  const { nodes, edges, hiddenIds } = useGraphData();
  const { nodeWidth, nodeHeight, edgeWidth, cornerRadius, edgeStyle, edgeStrokeStyle, direction } = useLayoutConfig();
  const { selectedNodeIds } = useUiState();
  const { toast } = useToast();
  const tier = useGraphStore((s) => s.tier);
  // Guests always export with the fewer watermark; the toggle stays functional
  // only for signed-in users.
  const canRemoveBranding = can("unbrandedExport", tier);
  const includeBranding = !canRemoveBranding || settings.includeBranding;
  const [exportSelected, setExportSelected] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // A lone file node has no descendants, so for non-image formats "export
  // selection" would export exactly one node — block it and hide the option
  // (folders and multi-node selections still qualify). Image formats (PNG/SVG)
  // still allow exporting a single file as an image.
  const isImageFormat = settings.format === "png" || settings.format === "svg";
  const singleFileSelected = isSingleFileSelected(selectedNodeIds, settings.format, nodes);

  // If the toggle was on and the selection collapses to a single file node,
  // switch it off so the export falls back to the full canvas.
  useEffect(() => {
    if (exportSelected && singleFileSelected) {
      setExportSelected(false);
    }
  }, [exportSelected, singleFileSelected]);

  const formats = can("advancedImportFormats", tier)
    ? [...BASIC_FORMATS, ...ADVANCED_FORMATS]
    : BASIC_FORMATS;

  useEffect(() => {
    if (!can("advancedImportFormats", tier)) {
      const isAdvancedFormat = ADVANCED_FORMATS.some(
        (f) => f.value === settings.format
      );
      if (isAdvancedFormat) {
        setSettings({ format: "png" });
      }
    }
  }, [tier, settings.format, setSettings]);

  const { exportNodes, exportEdges } = useMemo(() => {
    if (!exportSelected || selectedNodeIds.length === 0 || singleFileSelected) {
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
  }, [exportSelected, selectedNodeIds, nodes, edges, singleFileSelected]);

  // ── Image export mirrors the ACTIVE leaf's resolved view ──
  // A canvas paints a per-view graph: view hidden layers, per-view card
  // positions or its own derived layout, collapsed folders, tag rings, per-view
  // edge style. Reusing the canvas's own resolver (resolveViewNodes) keeps the
  // two in lockstep. The active-leaf indicator is a DOM overlay inside the leaf
  // header, never part of the scene builder — exports stay clean by design.
  const activeLeaf = useActiveLeaf();
  const resolved = activeLeaf?.resolved;
  // Raw per-view settings — the derivation predicate reads which keys are set.
  const rawViewSettings = activeLeaf ? viewSettings[activeLeaf.leafId] : undefined;
  const fileIds = useMemo(
    () => nodes.filter((n) => n.data.type === "file").map((n) => n.id),
    [nodes],
  );
  const viewHiddenIds = resolved?.hiddenIds ?? hiddenIds;
  const viewHiddenSet = useMemo(() => new Set(viewHiddenIds), [viewHiddenIds]);

  const imageGraph = useMemo(() => {
    if (!isImageFormat) {
      return {
        nodes: exportNodes,
        edges: exportEdges,
        collapsedIds: undefined as Set<string> | undefined,
      };
    }
    const visibleAll = filterVisibleNodes(nodes, viewHiddenIds);
    const visibleEdgesAll = filterVisibleEdges(edges, viewHiddenIds);
    const positioned = resolved
      ? resolveViewNodes(
          visibleAll,
          visibleEdgesAll,
          rawViewSettings,
          resolved,
          { direction, hiddenIds, fileIds },
          { shynessScale, sortKey, sortDir, tagLabelById: makeTagLabelLookup(tags) },
        )
      : visibleAll;
    const viewById = new Map(positioned.map((n) => [n.id, n]));
    // Keep the scope-filtered list whole (hidden children still show as folder
    // rows) but take the position AND the layout stamp the view paints, so edge
    // geometry never reads a stale `layoutDirection` from the shared layout.
    const imageNodes = exportNodes.map((n) => {
      const v = viewById.get(n.id);
      if (!v) return n;
      return {
        ...n,
        position: v.position,
        data: {
          ...n.data,
          layoutDirection: v.data.layoutDirection,
          isHorizontal: v.data.isHorizontal,
        },
      };
    });
    // Per-view edge style/width/stroke come from the resolved settings, exactly
    // as the canvas applies them to its own edges.
    const viewEdgeType = edgeTypeFromStyle(resolved?.edgeStyle ?? edgeStyle);
    const viewDash = edgeDashPattern(resolved?.edgeStrokeStyle ?? edgeStrokeStyle);
    const viewEdgeWidth = resolved?.edgeWidth ?? edgeWidth;
    const imageEdges = exportEdges.map((e) => ({
      ...e,
      type: viewEdgeType,
      style: { ...e.style, strokeWidth: viewEdgeWidth, strokeDasharray: viewDash },
    }));
    const collapsedIds = new Set<string>([
      ...(resolved?.collapsedFolderIds ?? []),
      ...nodes.filter((n) => n.data.collapsed).map((n) => n.id),
    ]);
    return { nodes: imageNodes, edges: imageEdges, collapsedIds };
  }, [
    isImageFormat, exportNodes, exportEdges, nodes, edges, viewHiddenIds, resolved,
    rawViewSettings, direction, hiddenIds, fileIds, shynessScale, sortKey, sortDir,
    tags, edgeStyle, edgeStrokeStyle, edgeWidth,
  ]);

  const handleExport = () => {
    const nodesToExport = exportNodes;
    const edgesToExport = exportEdges;

    if (settings.format === "script") {
      exportDirectoryScript(nodesToExport, edgesToExport, includeBranding);
    } else if (settings.format === "tree") {
      exportDirectoryTree(nodesToExport, edgesToExport, includeBranding);
    } else {
      const stats = computeStats(nodesToExport, edgesToExport);
      // Images export the active view's graph; data formats export the raw graph.
      exportGraph(
        isImageFormat ? imageGraph.nodes : nodesToExport,
        isImageFormat ? imageGraph.edges : edgesToExport,
        { ...settings, includeBranding },
        stats,
        {
          // Selection travels with the image: the renderer draws the accent
          // selection ring on each selected card and highlights the ancestor-path
          // edges feeding them, mirroring the canvas.
          selectedIds: selectedNodeIds,
          hiddenIds: viewHiddenIds,
          nodeWidth,
          nodeHeight,
          edgeWidth: resolved?.edgeWidth ?? edgeWidth,
          cornerRadius,
          collapsedIds: imageGraph.collapsedIds,
          tags,
          // Canvas handles follow the view's direction; edges must too.
          direction: resolved?.direction ?? direction,
        },
      );
    }
    setOpen(false);
    toast({
      title: "Exported",
      description: `${settings.format.toUpperCase()}: ${nodesToExport.length} card${nodesToExport.length === 1 ? "" : "s"}, ${edgesToExport.length} connection${edgesToExport.length === 1 ? "" : "s"}`,
    });
  };

  const isRaster = settings.format === "png";
  const canExportSelected = selectedNodeIds.length > 0 && !singleFileSelected;

  // SVG/PNG render only the non-hidden subset of the export selection (the
  // active view's hidden set), so if every exportable node is hidden the image
  // would be blank — block those two formats.
  const imageExportableCount = useMemo(
    () => exportNodes.filter((n) => !viewHiddenSet.has(n.id)).length,
    [exportNodes, viewHiddenSet],
  );
  const imageBlocked = isImageFormat && imageExportableCount === 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="export-panel w-full sm:max-w-md overflow-y-auto gm-scroll bg-background/95 backdrop-blur-md border-l border-border/40 p-6">
        <SheetHeader className="space-y-2">
          <SheetTitle className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
            <Download className="h-5 w-5 text-muted-foreground/85" />
            Export
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed font-normal">
            Choose format and download.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Format</Label>
            <div className="grid grid-cols-1 gap-2">
              {formats.map((f) => {
                const Icon = f.icon;
                const active = settings.format === f.value;
                return (
                  /* Hybrid Choice Card (Custom <button>) */
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setSettings({ format: f.value })}
                    className={cn(
                      "group flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-fewer-file-border bg-fewer-file-bg text-fewer-file-icon shadow-sm "
                        : "border-border/50 hover:border-border hover:bg-muted/30 text-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                        active ? "bg-fewer-file-icon text-white" : "bg-muted text-muted-foreground/70 group-hover:text-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold tracking-tight">{f.label}</div>
                      <div className="text-xs text-muted-foreground leading-snug font-normal">
                        {f.desc}
                      </div>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                          <span 
                            onClick={(e) => e.stopPropagation()} 
                            className="flex items-center justify-center rounded-full hover:bg-muted/80 p-1 transition-colors cursor-pointer shrink-0 self-center"
                          >
                            <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] text-xs leading-normal">
                          {f.info}
                        </TooltipContent>
                      </Tooltip>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons (Standard shadcn Button) */}
          {imageBlocked && (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-center text-xs text-muted-foreground leading-relaxed">
              Every card that would be exported for this {settings.format.toUpperCase()} is hidden. Un-hide cards
              (Hidden panel → Reveal All) to export an image.
            </div>
          )}
          <Button
            className="w-full gap-2 text-sm font-semibold bg-gradient-to-r bg-fewer-file-icon text-white hover:opacity-90 shadow-sm active:scale-[0.96] transition-all h-11"
            onClick={handleExport}
            disabled={nodes.length === 0 || imageBlocked}
            data-all-nodes-hidden={imageBlocked ? "true" : undefined}
          >
            <Download className="h-4.5 w-4.5" />
            Download
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2 border-border/80 hover:bg-muted/40 text-sm font-semibold h-11"
            onClick={() => useGraphStore.getState().setShareOpen(true)}
            disabled={nodes.length === 0}
          >
            <Link className="h-4.5 w-4.5" />
            Generate Share Link
          </Button>

          {!singleFileSelected && (
            <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/10 p-3.5 hover:border-border/80 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <MousePointerClick className="h-4 w-4 text-muted-foreground/85 shrink-0" />
                <div className="min-w-0">
                  <Label className="text-xs font-semibold">Export Selected</Label>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5">
                    {canExportSelected
                      ? `${plural(selectedNodeIds.length, "card")} + descendants`
                      : "Select cards first"}
                  </p>
                </div>
              </div>
              <Switch
                checked={exportSelected && canExportSelected}
                onCheckedChange={(v) => setExportSelected(v)}
                disabled={!canExportSelected}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/10 p-3.5 hover:border-border/80 transition-colors">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold">Include fewer branding</Label>
              <p className="text-xs text-muted-foreground">
                {!canRemoveBranding
                  ? "Signed out — exports carry the fewer watermark until you sign in."
                  : "Adds a linked fewer logo watermark to PNG/SVG exports and a credit line to other formats."}
              </p>
            </div>
            <Switch
              checked={includeBranding}
              onCheckedChange={(v) => setSettings({ includeBranding: v })}
              disabled={!canRemoveBranding}
            />
          </div>

          {isRaster && (
            <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4 transition-colors">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">Quality</Label>
                <span className="text-xs font-mono font-semibold text-foreground/80"><EditableNumber value={settings.quality} onCommit={(v) => setSettings({ quality: v })} unit="%" /></span>
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
                <Label className="text-xs font-semibold">Transparent Background</Label>
                <p className="text-xs text-muted-foreground">
                  Remove background fill.
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
                <Label className="text-xs font-semibold">Include Stats</Label>
                <p className="text-xs text-muted-foreground">
                  Include stats in JSON.
                </p>
              </div>
              <Switch
                checked={settings.includeStats}
                onCheckedChange={(v) => setSettings({ includeStats: v })}
              />
            </div>
          )}

          <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
            <div className="rounded-xl border border-border/40 bg-muted/25 p-4 text-xs text-muted-foreground space-y-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-1.5 w-full justify-start h-auto p-0 font-bold text-foreground/90 tracking-wider text-[10px] uppercase hover:bg-transparent">
                  <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", summaryOpen && "rotate-90")} />
                  Summary
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 overflow-hidden data-[state=open]:animate-[collapsible-down_300ms_ease-out] data-[state=closed]:animate-[collapsible-up_300ms_ease-out] pt-2">
                <div className="flex items-center justify-between border-b border-border/10 pb-1.5">
                  <span>Cards</span>
                  <span className="font-mono text-foreground/90 font-semibold">
                    {exportSelected && canExportSelected
                      ? `${exportNodes.length} cards`
                      : `${nodes.length} cards`}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/10 pb-1.5">
                  <span>Connections</span>
                  <span className="font-mono text-foreground/90 font-semibold">
                    {exportSelected && canExportSelected
                      ? `${exportEdges.length} connections`
                      : `${edges.length} connections`}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/10 pb-1.5">
                  <span>Scope</span>
                  <span className="text-foreground/90 font-medium">
                    {exportSelected && canExportSelected ? "Selection" : "Full Canvas"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Format</span>
                  <span className="uppercase font-mono font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-[10px]">{settings.format}</span>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

        </div>
      </SheetContent>
    </Sheet>
  );
}