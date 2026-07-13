"use client";

import { useCallback, useEffect, useState } from "react";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { SearchPanel } from "./SearchPanel";
import { ExportPanel } from "./ExportPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { GraphCanvas } from "./GraphCanvas";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { ImportDialog } from "./ImportDialog";
import { ImportFromFileDialog } from "./ImportFromFileDialog";
import { BugReportDialog } from "./BugReportDialog";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph } from "@/lib/graphir/treeToGraph";
import { SAMPLE_TREE } from "@/lib/graphir/sampleData";
import { pickDirectoryTree, isFileSystemAccessSupported } from "@/lib/graphir/fileSystem";
import type { ImportOptions } from "@/lib/graphir/importOptions";
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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFromFileOpen, setImportFromFileOpen] = useState(false);

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

  // Opening the directory picker is now a two-step flow:
  // 1. User clicks "Import Folder" → show ImportDialog with settings
  // 2. User configures options and confirms → actually pick + import
  const handleOpenDirectory = useCallback(() => {
    setImportDialogOpen(true);
  }, []);

  const handleConfirmImport = useCallback(
    async (options: ImportOptions) => {
      setImporting(true);
      try {
        const tree = await pickDirectoryTree(options);
        if (!tree) {
          setImporting(false);
          setImportDialogOpen(false);
          return;
        }
        const { nodes, edges } = treeToGraph(tree);
        setGraph(nodes, edges, false);
        setImportDialogOpen(false);
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
      } finally {
        setImporting(false);
      }
    },
    [setGraph, toast]
  );

  const handleLoadSample = useCallback(() => {
    const { nodes, edges } = treeToGraph(SAMPLE_TREE, { idPrefix: "sample" });
    setGraph(nodes, edges, false);
    toast({ title: "Sample project loaded", description: "graphir-pro-max-ultra" });
  }, [setGraph, toast]);

  const handleImportFromFile = useCallback(
    (tree: import("@/lib/graphir/types").TreeEntry) => {
      const { nodes, edges } = treeToGraph(tree, { idPrefix: "file-import" });
      setGraph(nodes, edges, false);
      toast({
        title: "Graph built from file",
        description: `${tree.name} — ${nodes.length} entries`,
      });
    },
    [setGraph, toast]
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background gm-app-bg">
      <Toolbar
        onOpenDirectory={handleOpenDirectory}
        onLoadSample={handleLoadSample}
      />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <div className="hidden sm:block w-[280px] shrink-0 min-h-0">
            <Sidebar onOpenDirectory={handleOpenDirectory} onImportFromFile={() => setImportFromFileOpen(true)} />
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
              <Sidebar onOpenDirectory={handleOpenDirectory} onImportFromFile={() => setImportFromFileOpen(true)} />
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

      <BugReportDialog />

      <ImportFromFileDialog
        open={importFromFileOpen}
        onOpenChange={setImportFromFileOpen}
        onImport={handleImportFromFile}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onConfirm={handleConfirmImport}
        importing={importing}
      />

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
                handleLoadSample();
                setWelcomeOpen(false);
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Load sample project
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
