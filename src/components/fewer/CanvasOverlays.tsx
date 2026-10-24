import type { ReactNode } from "react";
import { Panel } from "@xyflow/react";
import { EyeOff, FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGraphStore } from "@/store/graphStore";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";
import { plural } from "@/lib/fewer/plural";
import type { CanvasChipStyle } from "@/lib/fewer/themeColors";

/**
 * Overlay panels for the canvas: loading spinner, empty-graph message,
 * "all hidden" message, and hidden-card chip. Extracted from CanvasInner
 * so GraphCanvas stays declarative and these are testable independently.
 */
export function CanvasOverlays({
  loading,
  rfNodesCount,
  graphsExists,
  vs,
  leafId,
  onOpenImport,
  onLoadSample,
  hiddenCount,
  hiddenChipStyle,
}: {
  loading: boolean;
  rfNodesCount: number;
  graphsExists: boolean;
  vs: ResolvedViewSettings;
  leafId?: string | null;
  onOpenImport: () => void;
  onLoadSample: () => void;
  hiddenCount: number;
  hiddenChipStyle: CanvasChipStyle;
}): ReactNode {
  return (
    <>
      {loading && (
        <Panel position="top-center" className="!top-[15%]">
          <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
            <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
        </Panel>
      )}
      {!loading && rfNodesCount === 0 && graphsExists && (
        <Panel position="top-center" className="!top-[15%]">
          <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
            <EyeOff className="h-12 w-12 text-muted-foreground/60" />
            <div className="text-lg font-semibold">Everything is hidden</div>
            <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">
              {vs.showFiles
                ? "All cards on this graph are currently hidden on the canvas."
                : "This graph is made only of files and \"Show Files\" is off, so nothing is displayed."}
            </div>
            {!vs.showFiles && (
              <Button
                variant="outline"
                onClick={() =>
                  leafId
                    ? useGraphStore.getState().setFilesBulkForLeaf(leafId, false)
                    : useGraphStore.getState().setShowFiles(true)
                }
                data-tutorial="show-files-button"
              >
                <FolderOpen className="h-4 w-4" />
                Show Files
              </Button>
            )}
          </div>
        </Panel>
      )}
      {!loading && rfNodesCount === 0 && !graphsExists && (
        <Panel position="top-center" className="!top-[15%]">
          <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
            <FolderOpen className="h-12 w-12 text-muted-foreground/60" />
            <div className="text-lg font-semibold">No directory loaded</div>
            <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">
              Use the sidebar to open a directory from your file system, or
              load one of the sample datasets to explore the visualization.
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <Button onClick={onOpenImport} data-tutorial="sample-button">
                <FolderOpen className="h-4 w-4" />
                Import
              </Button>
              <Button variant="outline" onClick={onLoadSample} data-tutorial="sample-button">
                <Sparkles className="h-4 w-4 text-primary" />
                Load sample
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {hiddenCount > 0 && (
        <Panel position="top-right">
          <button
            className="rounded-full px-3 py-1.5 text-xs cursor-pointer transition-colors animate-in fade-in slide-in-from-right-2 duration-200 backdrop-blur-md"
            style={hiddenChipStyle}
            onClick={() => {
              useGraphStore.getState().setSidebarOpen(true);
              useGraphStore.getState().triggerHiddenPanelExpand();
            }}
          >
            {plural(hiddenCount, "card")} hidden
          </button>
        </Panel>
      )}
    </>
  );
}
