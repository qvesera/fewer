"use client";

import { useGraphStore } from "@/store/graphStore";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { SlidingToggle } from "@/components/ui/sliding-toggle";
import dynamic from "next/dynamic";
import { type AreaEditor, type PanelArea, AREA_EDITOR_LABELS } from "@/lib/fewer/panelLayout";
import { sectionMetaById } from "./sectionRegistry";
import { HiddenNodesPanel } from "./HiddenNodesPanel";
import { LayoutPicker } from "./LayoutPicker";
import { StatsPanel, SavedGraphsPanel, TagsPanel } from ".";
import type { EdgeStyle } from "@/lib/fewer/types";

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
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3">
      <SectionContent editor={area.editor} />
    </div>
  );
}

/** Maps an editor id to the correct section component. */
function SectionContent({ editor }: { editor: AreaEditor }) {
  switch (editor) {
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
  const direction = useGraphStore((s) => s.direction);
  const setDirection = useGraphStore((s) => s.setDirection);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const relayout = useGraphStore((s) => s.relayout);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <LayoutPicker direction={direction} onPick={setDirection} advancedModeEnabled={advancedModeEnabled} />
      <Button
        size="sm"
        className="w-full gap-2 border-border/60 text-xs font-semibold min-w-0"
        onClick={() => relayout()}
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Rearrange</span>
      </Button>
      <div className="flex items-center justify-between rounded-lg border border-border/20 p-2.5 bg-card/5 w-full min-w-0">
        <Label className="text-xs font-medium cursor-pointer truncate">Include File Cards</Label>
        <Switch checked={showFiles} onCheckedChange={setShowFiles} className="shrink-0" />
      </div>
    </div>
  );
}

function EdgesSection() {
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const setEdgeStyle = useGraphStore((s) => s.setEdgeStyle);
  const styles = [
    { value: "curved" as EdgeStyle, label: "Curved" },
    { value: "straight" as EdgeStyle, label: "Straight" },
    { value: "angled" as EdgeStyle, label: "Angled" },
  ];
  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      <div className="space-y-1.5 w-full min-w-0">
        <Label className="text-[11px] font-medium text-muted-foreground">Style</Label>
        <SlidingToggle options={styles} value={edgeStyle} onValueChange={(v) => setEdgeStyle(v as EdgeStyle)} />
      </div>
    </div>
  );
}