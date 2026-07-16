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
   onOpenDirectory,
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
     <header className="gm-float z-20 mx-3 mt-3 flex items-center gap-1 sm:gap-2 rounded-2xl px-2 sm:px-3 py-2 overflow-x-auto flex-nowrap max-sm:[&::-webkit-scrollbar]:h-1.5 max-sm:[&::-webkit-scrollbar-thumb]:rounded-full max-sm:[&::-webkit-scrollbar-thumb]:bg-border/50 max-sm:[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-0">
       <div className="flex items-center gap-2 pr-2">
         <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-purple-600 shadow-lg shadow-purple-500/30">
           <LayoutTemplate className="h-4 w-4 text-white" />
         </div>
         <div className="hidden sm:flex flex-col leading-none">
           <span className="text-sm font-bold tracking-tight text-balance">
             fewer
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
         className="gap-1.5 shrink-0"
         onClick={() => setSidebarOpen(!sidebarOpen)}
         title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
       >
         {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
         <span className="hidden md:inline">View</span>
       </Button>
   
       <div className="flex-1" />
   
       {advancedModeEnabled && (
         <div className="flex items-center gap-1">
           <Button
             variant="ghost"
             size="icon"
             className="h-7 w-7 sm:h-8 sm:w-8"
             onClick={undo}
             disabled={!canUndo}
             title="Undo (Ctrl+Z)"
             aria-label="Undo (Ctrl+Z)"
           >
             <Undo2 className="h-4 w-4" />
           </Button>
           <Button
             variant="ghost"
             size="icon"
             className="h-7 w-7 sm:h-8 sm:w-8"
             onClick={redo}
             disabled={!canRedo}
             title="Redo (Ctrl+Shift+Z)"
             aria-label="Redo (Ctrl+Shift+Z)"
           >
             <Redo2 className="h-4 w-4" />
           </Button>
           <Button
             variant="ghost"
             size="icon"
             className="h-7 w-7 sm:h-8 sm:w-8"
             onClick={() => selectedNodeIds.length && deleteNodes(selectedNodeIds)}
             disabled={selectedNodeIds.length === 0}
             title="Delete selected (Delete)"
             aria-label="Delete selected (Delete)"
           >
             <Trash2 className="h-4 w-4" />
           </Button>
         </div>
       )}

      <div className="h-6 w-px bg-border/40 hidden sm:block" />

      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 shrink-0"
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
        className="gap-1.5 shrink-0 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white hover:from-purple-600 hover:to-fuchsia-600"
        onClick={() => setExportOpen(true)}
      >
        <Download className="h-4 w-4" />
        <span className="hidden md:inline">Export</span>
      </Button>

       <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onLoadSample} data-tutorial="sample-button">
         <Sparkles className="h-4 w-4" />
         <span className="hidden lg:inline">Sample</span>
       </Button>

      {onRestartTutorial && (
        <Button
          variant="ghost"
          size="sm"
          className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 shrink-0"
          onClick={onRestartTutorial}
          title="Restart tutorial"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
        onClick={() => useGraphStore.getState().setShortcutsOpen(true)}
        aria-label="Keyboard shortcuts"
      >
        <Keyboard />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
        onClick={() => setBugReportOpen(true)}
        title="Report a bug"
        aria-label="Report a bug"
      >
        <Bug className="h-4 w-4 text-red-400" />
      </Button>
    </header>
  );
}