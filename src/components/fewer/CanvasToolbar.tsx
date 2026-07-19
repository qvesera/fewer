"use client";

import { Button } from "@/components/ui/button";
import { Undo2, Redo2, Trash2, Sparkles, Download, PanelLeftClose, PanelLeft } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";

interface CanvasToolbarProps {
  onLoadSample: () => void;
}

export function CanvasToolbar({ onLoadSample }: CanvasToolbarProps) {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.past.length > 0);
  const canRedo = useGraphStore((s) => s.future.length > 0);
  const setExportOpen = useGraphStore((s) => s.setExportOpen);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);

  return (
    <div className="w-full flex items-center justify-between gap-2 border-b border-border/30 bg-background/50 backdrop-blur-sm px-4 py-1.5 overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:h-0">
      
      {/* Left Area: View Toggles */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          <span className="text-s font-medium">Sidebar</span>
        </Button>
      </div>

      {/* Middle Area: Core Node Mutations / Canvas Toolkits */}
      {advancedModeEnabled && (
        <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5 border border-border/40">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <div className="h-4 w-px bg-border/60 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-400 disabled:opacity-30"
            onClick={() => selectedNodeIds.length && deleteNodes(selectedNodeIds)}
            disabled={selectedNodeIds.length === 0}
            title="Delete selection"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Right Area: Ingest & Transaction Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 font-medium text-s text-muted-foreground hover:text-foreground shrink-0"
          onClick={onLoadSample}
          data-tutorial="sample-button"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>Load Sample</span>
        </Button>

        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1.5 font-medium text-s bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm shrink-0"
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export</span>
        </Button>
      </div>
    </div>
  );
}