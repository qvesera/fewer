"use client";

import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  Undo2,
  Redo2,
  Search,
  Download,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Trash2,
  Bug,
  Sparkles,
} from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useTheme } from "next-themes";
import { useCallback } from "react";

interface ToolbarProps {
  onOpenDirectory: () => void;
  onLoadSample: () => void;
  onLoadAdvanced: () => void;
}

export function Toolbar({
  onOpenDirectory,
  onLoadSample,
  onLoadAdvanced,
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
  const { theme, setTheme } = useTheme();

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <header className="z-20 flex items-center gap-2 border-b border-border/40 bg-card/60 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center gap-2 pr-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-purple-600 shadow-lg shadow-purple-500/30">
          <LayoutTemplate className="h-4 w-4 text-white" />
        </div>
        <div className="hidden sm:flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight">
            Graphir <span className="text-orange-500">Pro</span>{" "}
            <span className="text-purple-500">Max</span>{" "}
            <span className="text-xs text-muted-foreground">Ultra</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            Directory visualization
          </span>
        </div>
      </div>

      <div className="h-6 w-px bg-border/40 hidden md:block" />

      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        <span className="hidden md:inline">View</span>
      </Button>

      <Button
        variant="default"
        size="sm"
        className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
        onClick={onOpenDirectory}
      >
        <FolderOpen className="h-4 w-4" />
        <span className="hidden md:inline">Open Directory</span>
      </Button>

      <Button variant="outline" size="sm" className="gap-1.5" onClick={onLoadSample}>
        <Sparkles className="h-4 w-4" />
        <span className="hidden lg:inline">Sample</span>
      </Button>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onLoadAdvanced}>
        <Sparkles className="h-4 w-4" />
        <span className="hidden lg:inline">Monorepo</span>
      </Button>

      <div className="flex-1" />

      <div className="hidden sm:flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => selectedNodeIds.length && deleteNodes(selectedNodeIds)}
          disabled={selectedNodeIds.length === 0}
          title="Delete selected (Delete)"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border/40 hidden sm:block" />

      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => setSearchOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden lg:inline-flex ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          ⌘F
        </kbd>
      </Button>

      <Button
        variant="default"
        size="sm"
        className="gap-1.5 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white hover:from-purple-600 hover:to-fuchsia-600"
        onClick={() => setExportOpen(true)}
      >
        <Download className="h-4 w-4" />
        <span className="hidden md:inline">Export</span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={toggleTheme}
        title="Toggle theme"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setBugReportOpen(true)}
        title="Report a bug"
      >
        <Bug className="h-4 w-4 text-red-400" />
      </Button>
    </header>
  );
}
