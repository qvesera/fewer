"use client";

import { Button } from "@/components/ui/button";
import {
  Undo2,
  Redo2,
  Search,
  Download,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Bug,
  Sparkles,
  HelpCircle,
  Keyboard,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";

interface ToolbarProps {
  onOpenDirectory: () => void;
  onLoadSample: () => void;
  onRestartTutorial?: () => void;
}

export function Toolbar({
  onLoadSample,
  onRestartTutorial,
}: ToolbarProps) {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.past.length > 0);
  const canRedo = useGraphStore((s) => s.future.length > 0);
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const setExportOpen = useGraphStore((s) => s.setExportOpen);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const setBugReportOpen = useGraphStore((s) => s.setBugReportOpen);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  
  return (
    <header className="z-20 mx-4 mt-4 flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/80 backdrop-blur-md px-4 py-2.5 shadow-sm">
      
      {/* SECTION 1: IDENTITY & LAYOUT CONTROL */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 border-r border-border/40 pr-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-amber-500 text-white">
            <LayoutTemplate className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight">fewer</span>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          <span className="hidden sm:inline text-xs font-medium">Layout</span>
        </Button>
      </div>

      {/* SECTION 2: THE GLOBAL SEARCH BAR */}
      <div className="flex-1 max-w-md hidden md:block">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:border-border/80 transition-all group"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 group-hover:text-foreground transition-colors" />
            <span>Search structural directory components...</span>
          </div>
          <kbd className="inline-flex items-center rounded bg-background border border-border/60 px-1.5 font-mono text-[10px] text-muted-foreground opacity-80">
            ⌘F
          </kbd>
        </button>
      </div>

      {/* SECTION 3: GRAPH HISTORY & MUTATIONS (MIDDLE/RIGHT) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Search Trigger */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden text-muted-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>

        {advancedModeEnabled && (
          <div className="flex items-center gap-0.5 border-r border-border/40 pr-2 sm:pr-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-400 disabled:opacity-30"
              onClick={() => selectedNodeIds.length && deleteNodes(selectedNodeIds)}
              disabled={selectedNodeIds.length === 0}
              title="Delete selected"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* PRIMARY TRANSACTION ACTIONS */}
        <div className="flex items-center gap-1.5 border-r border-border/40 pr-2 sm:pr-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 font-medium text-xs border-border/60 hover:bg-muted/40"
            onClick={onLoadSample}
            data-tutorial="sample-button"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
            <span className="hidden lg:inline">Load Sample</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 font-medium text-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-sm"
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </Button>
        </div>

        {/* METRICS & SYSTEM PANEL UTILITIES */}
        <div className="flex items-center gap-0.5">
          {onRestartTutorial && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-orange-400/80 hover:bg-orange-500/10 hover:text-orange-500"
              onClick={onRestartTutorial}
              title="Restart system tour tutorial"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => useGraphStore.getState().setShortcutsOpen(true)}
            title="Keyboard hotkeys map"
          >
            <Keyboard className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/5"
            onClick={() => setBugReportOpen(true)}
            title="Submit operational anomaly report"
          >
            <Bug className="h-4 w-4" />
          </Button>
        </div>
      </div>

    </header>
  );
}