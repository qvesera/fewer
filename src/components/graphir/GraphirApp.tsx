"use client";

import { useCallback, useEffect, useState } from "react";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { SearchPanel } from "./SearchPanel";
import { ExportPanel } from "./ExportPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { GraphCanvas } from "./GraphCanvas";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph } from "@/lib/graphir/treeToGraph";
import { SAMPLE_TREE, ADVANCED_TREE } from "@/lib/graphir/sampleData";
import { pickDirectoryTree, isFileSystemAccessSupported } from "@/lib/graphir/fileSystem";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/hooks/use-device";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, FolderOpen, Sparkles } from "lucide-react";

export function GraphirApp() {
  const setGraph = useGraphStore((s) => s.setGraph);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const { toast } = useToast();
  const device = useDevice();

  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [fsSupported] = useState(() => isFileSystemAccessSupported());

  // On mobile, start with sidebar closed
  useEffect(() => {
    if (device.isMobile) {
      setSidebarOpen(false);
    }
  }, [device.isMobile, setSidebarOpen]);

  useEffect(() => {
    // Preload the sample tree on first mount so the canvas isn't empty.
    const { nodes, edges } = treeToGraph(SAMPLE_TREE);
    setGraph(nodes, edges, false);
  }, [setGraph]);

  const handleOpenDirectory = useCallback(async () => {
    try {
      const tree = await pickDirectoryTree();
      if (!tree) return;
      const { nodes, edges } = treeToGraph(tree);
      setGraph(nodes, edges, false);
      toast({
        title: "Directory loaded",
        description: `${tree.name} — ${nodes.length} entries`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Could not open directory",
        description: msg,
        variant: "destructive",
      });
    }
  }, [setGraph, toast]);

  const handleLoadSample = useCallback(() => {
    const { nodes, edges } = treeToGraph(SAMPLE_TREE, { idPrefix: "sample" });
    setGraph(nodes, edges, false);
    toast({ title: "Sample project loaded", description: "graphir-pro-max-ultra" });
  }, [setGraph, toast]);

  const handleLoadAdvanced = useCallback(() => {
    const { nodes, edges } = treeToGraph(ADVANCED_TREE, { idPrefix: "mono" });
    setGraph(nodes, edges, false);
    toast({ title: "Monorepo loaded", description: "monorepo-root" });
  }, [setGraph, toast]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background gm-app-bg">
      <Toolbar
        onOpenDirectory={handleOpenDirectory}
        onLoadSample={handleLoadSample}
        onLoadAdvanced={handleLoadAdvanced}
      />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <div className="hidden sm:block w-[280px] shrink-0 min-h-0">
            <Sidebar onOpenDirectory={handleOpenDirectory} />
          </div>
        )}
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="sm:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => useGraphStore.getState().setSidebarOpen(false)}
            />
            <div className="relative w-[280px] h-full">
              <Sidebar onOpenDirectory={handleOpenDirectory} />
            </div>
          </div>
        )}
        <main className="relative min-w-0 flex-1 min-h-0">
          <ErrorBoundary>
            <GraphCanvas />
          </ErrorBoundary>
          <BreadcrumbBar />
          <SearchPanel />
        </main>
      </div>

      <ExportPanel />

      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="bg-gradient-to-br from-orange-500 to-purple-600 bg-clip-text text-transparent">
                Graphir Pro Max Ultra
              </span>
            </DialogTitle>
            <DialogDescription>
              The ultimate directory visualization application. Transform your file
              system navigation into an art form with React Flow, dynamic layouts,
              multi-format exports, and more.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2 text-sm">
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Loaded
              </div>
              <div className="font-semibold">Sample project tree</div>
              <div className="text-xs text-muted-foreground">
                Try Open Directory for your own files.
              </div>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                File System API
              </div>
              <div className="font-semibold">
                {fsSupported ? "Available" : "Unavailable"}
              </div>
              <div className="text-xs text-muted-foreground">
                {fsSupported
                  ? "You can open real directories."
                  : "Use Chrome/Edge for native FS access."}
              </div>
            </div>
          </div>

          {!fsSupported && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Your browser doesn&apos;t support the File System Access API. You can
                still explore the sample datasets and use all the export / search /
                layout features.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                handleLoadAdvanced();
                setWelcomeOpen(false);
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Load monorepo demo
            </Button>
            <Button
              onClick={() => {
                if (fsSupported) handleOpenDirectory();
                setWelcomeOpen(false);
              }}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {fsSupported ? "Open my directory" : "Start exploring"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
