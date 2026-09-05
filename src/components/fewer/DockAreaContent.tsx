"use client";

import { useGraphStore } from "@/store/graphStore";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RefreshCw, FolderOpen, Trash2, FilePlus, FolderPlus } from "lucide-react";
import { SlidingToggle } from "@/components/ui/sliding-toggle";
import dynamic from "next/dynamic";
import { type AreaEditor, type PanelArea, AREA_EDITOR_LABELS } from "@/lib/fewer/panelLayout";
import { sectionMetaById } from "./sectionRegistry";
import { HiddenNodesPanel } from "./HiddenNodesPanel";
import { LayoutPicker } from "./LayoutPicker";
import { StatsPanel, SavedGraphsPanel, TagsPanel } from ".";
import type { EdgeStyle } from "@/lib/fewer/types";
import { useActiveLeaf } from "@/hooks/use-active-leaf";

const GraphCanvasForArea = dynamic(
  () => import("./GraphCanvas").then((m) => m.GraphCanvas),
  { ssr: false },
);

/** Renders the section content or a secondary graph viewport for one dock area. */
export function DockAreaContent({ area }: { area: PanelArea }) {
  const isGraph = area.editor === "graph";

  // Live store selectors for availability checks
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const nodes = useGraphStore((s) => s.nodes);
  const user = useGraphStore((s) => s.user);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  const storeSnapshot = { hiddenIds, nodes, user, advancedModeEnabled };
  const meta = sectionMetaById(area.editor);
  const isAvailable = meta ? meta.available(storeSnapshot) : true;

  if (isGraph) {
    return (
      <div className="flex-1 min-h-0">
        <GraphCanvasForArea
          onOpenImport={() => { useGraphStore.getState().setSidebarOpen(true); }}
          onLoadSample={() => {}}
          leafId={area.id}
        />
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        {meta && <meta.icon className="h-8 w-8 text-muted-foreground/40 mb-2" />}
        <p className="text-xs text-muted-foreground">
          {meta?.title} unavailable
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 p-3 flex flex-col min-w-0 overflow-hidden">
      <SectionContent editor={area.editor} />
    </div>
  );
}

/** Maps an editor id to the correct section component. */
function SectionContent({ editor }: { editor: AreaEditor }) {
  switch (editor) {
    case "file":
      return <FileSection />;
    case "directories":
      return <SavedGraphsPanel onRequireAuth={() => useGraphStore.getState().setAuthOpen(true)} />;
    case "layout":
      return <LayoutSection />;
    case "edges":
      return <EdgesSection />;
    case "hidden":
      return <HiddenNodesPanel />;
    case "tags":
      return <TagsPanel />;
    case "analytics":
      return <StatsPanel />;
    default:
      return null;
  }
}

function LayoutSection() {
  const activeLeaf = useActiveLeaf();
  const updateViewSettings = useGraphStore((s) => s.updateViewSettings);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const directionGlobal = useGraphStore((s) => s.direction);
  const relayout = useGraphStore((s) => s.relayout);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  const showFiles = activeLeaf?.resolved.showFiles ?? true;
  const direction = activeLeaf?.resolved.direction ?? directionGlobal;

  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <LayoutPicker
        direction={direction}
        onPick={(d) => { if (activeLeaf) updateViewSettings(activeLeaf.leafId, { direction: d }); else useGraphStore.getState().setDirection(d); }}
        advancedModeEnabled={advancedModeEnabled}
      />
      <Button
        size="sm"
        className="w-full gap-2 border-border/60 text-xs font-semibold min-w-0"
        onClick={() => relayout()}
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Rearrange</span>
      </Button>
      <div className="flex items-center justify-between rounded-lg border border-border/20 p-2.5 bg-card/5 w-full min-w-0">
        <Label className="text-xs font-medium cursor-pointer truncate">Show File Cards</Label>
        <Switch
          checked={showFiles}
          onCheckedChange={(v) => { if (activeLeaf) updateViewSettings(activeLeaf.leafId, { showFiles: v }); else setShowFiles(v); }}
          className="shrink-0"
        />
      </div>
    </div>
  );
}

function EdgesSection() {
  const activeLeaf = useActiveLeaf();
  const updateViewSettings = useGraphStore((s) => s.updateViewSettings);
  const edgeStyleGlobal = useGraphStore((s) => s.edgeStyle);
  const edgeStyle = activeLeaf?.resolved.edgeStyle ?? edgeStyleGlobal;
  const edgeStyleTarget = activeLeaf?.leafId;

  const styles = [
    { value: "curved" as EdgeStyle, label: "Curved" },
    { value: "straight" as EdgeStyle, label: "Straight" },
    { value: "angled" as EdgeStyle, label: "Angled" },
  ];
  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <div className="space-y-1.5 w-full min-w-0">
        <Label className="text-[11px] font-medium text-muted-foreground">Style</Label>
        <SlidingToggle
          options={styles}
          value={edgeStyle}
          onValueChange={(v) => { if (edgeStyleTarget) updateViewSettings(edgeStyleTarget, { edgeStyle: v as EdgeStyle }); }}
        />
      </div>
    </div>
  );
}

function FileSection() {
  const nodes = useGraphStore((s) => s.nodes);
  const reset = useGraphStore((s) => s.reset);

  const handleAddNode = (type: "file" | "folder") => {
    const name = type === "file" ? "new-file.txt" : "New Folder";
    const newId = useGraphStore.getState().addStandaloneNode(name, type, { x: 1000, y: 600 });
    useGraphStore.getState().setRenamingId(newId);
    useGraphStore.getState().setZoomToNode(newId);
  };

  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <Button
        className="w-full gap-2 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 shadow-sm transition-transform active:scale-[0.98] min-w-0 h-10"
        onClick={() => useGraphStore.getState().setSidebarOpen(true)}
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        <span className="truncate">Import</span>
      </Button>
      <div className="flex items-center gap-1 w-full min-w-0">
        <Button variant="ghost" size="sm" className="flex-1 min-w-0 gap-1 text-xs text-muted-foreground hover:text-foreground justify-start px-2" onClick={() => handleAddNode("file")}>
          <FilePlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">File</span>
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 min-w-0 gap-1 text-xs text-muted-foreground hover:text-foreground justify-start px-2" onClick={() => handleAddNode("folder")}>
          <FolderPlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Folder</span>
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-auto"
          onClick={() => reset()}
          disabled={nodes.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </div>
    </div>
  );
}