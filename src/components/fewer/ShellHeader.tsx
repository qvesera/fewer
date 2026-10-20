"use client";

import { PanelLeft, PanelLeftClose, Redo2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGraphStore } from "@/store/graphStore";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "./Logo";
import { SearchField } from "./SearchField";
import { ScanStatusChip } from "./ScanStatusChip";

/**
 * The desktop shell's header (T-198): ONE 44px bar instead of the web app's
 * GlobalNavbar + CanvasToolbar pair (~96px). Icon-only logo and sidebar
 * toggle, undo/redo/delete top-left, global search top-right. Settings and
 * Export live in the native application menu (T-197) — no header buttons.
 * The web build keeps the two-bar layout; FewerApp picks by `isHost()`.
 */
export function ShellHeader() {
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.past.length > 0);
  const canRedo = useGraphStore((s) => s.future.length > 0);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const { toast } = useToast();

  return (
    <header
      data-shell-header
      className="flex h-11 w-full shrink-0 items-center gap-1 border-b border-border/40 bg-background/95 px-2"
    >
      <div className="flex items-center px-1" aria-label="Fewer">
        <Logo size={20} />
      </div>
      <div className="h-4 w-px bg-border/60 mx-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </Button>
      <div className="h-4 w-px bg-border/60 mx-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
        onClick={undo}
        disabled={!canUndo}
        title="Undo"
        aria-label="Undo"
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
        aria-label="Redo"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-red-400 disabled:opacity-30"
        onClick={() => {
          if (selectedNodeIds.length) {
            deleteNodes(selectedNodeIds);
            toast({ title: "Deleted", description: `${selectedNodeIds.length} item${selectedNodeIds.length === 1 ? "" : "s"} removed` });
          }
        }}
        disabled={selectedNodeIds.length === 0}
        title="Delete selection"
        aria-label="Delete selection"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <div className="flex-1" />

      <ScanStatusChip />
      <SearchField className="w-full max-w-sm" />
    </header>
  );
}