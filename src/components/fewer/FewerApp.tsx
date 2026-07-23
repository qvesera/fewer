"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sidebar,
  SearchPanel,
  ExportPanel,
  ErrorBoundary,
  GraphCanvas,
  BreadcrumbBar,
  ImportDialog,
  ImportFromFileDialog,
  BugReportDialog,
  TutorialDialog,
  ShortcutsDialog,
  ShareDialog,
  AddNodeDialog,
} from ".";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph } from "@/lib/fewer/treeToGraph";
import { SAMPLE_TREE } from "@/lib/fewer/sampleData";
import {
  pickDirectoryTree,
  isFileSystemAccessSupported,
} from "@/lib/fewer/fileSystem";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/hooks/use-device";
import { cn } from "@/lib/utils";
import { GlobalNavbar } from "./GlobalNavbar";
import { CanvasToolbar } from "./CanvasToolbar";

export function FewerApp() {
  const setGraph = useGraphStore((s) => s.setGraph);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const { toast } = useToast();
  const device = useDevice();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFromFileOpen, setImportFromFileOpen] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [addStandaloneOpen, setAddStandaloneOpen] = useState(false);
  const [tutorialRestartKey, setTutorialRestartKey] = useState(0);
  const [hashLoaded, setHashLoaded] = useState(false);

  const handleRestartTutorial = useCallback(() => {
    setTutorialRestartKey((k) => k + 1);
  }, []);

  // On mobile, start with sidebar closed
  useEffect(() => {
    if (device.isMobile) {
      setSidebarOpen(false);
    }
  }, [device.isMobile, setSidebarOpen]);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("fewer-theme") as string | null;
    if (savedTheme) {
      useGraphStore.getState().setThemeMode(savedTheme as any);
    }
  }, []);

  // Load shared graph from URL hash
  useEffect(() => {
    if (hashLoaded) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    import("@/lib/fewer/share").then(({ decodeShareData }) => {
      const data = decodeShareData(hash);
      if (!data) {
        toast({
          title: "Invalid share link",
          description: "Could not decode the graph from the URL.",
          variant: "destructive",
        });
        return;
      }
      // Restore graph state
      useGraphStore.getState().setGraph(data.nodes, data.edges, false);
      useGraphStore.getState().setDirection(data.direction);
      useGraphStore.getState().setEdgeStyle(data.edgeStyle);
      useGraphStore.getState().setThemeMode(data.themeMode as any);
      useGraphStore.getState().setCornerRadius(data.cornerRadius);
      useGraphStore.getState().setNodeDimensions(data.nodeWidth, data.nodeHeight);
      useGraphStore.setState({ dataSource: "shared" });
      setHashLoaded(true);
      // Clear hash from address bar
      window.history.replaceState(null, "", window.location.pathname);
      toast({
        title: "Shared graph loaded",
        description: `${data.nodes.length} node${data.nodes.length === 1 ? "" : "s"} from share link`,
      });
    });
  }, [hashLoaded, toast]);

  // Listen for keyboard shortcuts and sidebar button clicks to open dialogs
  useEffect(() => {
    const openChild = () => setAddChildOpen(true);
    const openStandalone = () => setAddStandaloneOpen(true);
    const openImportFolder = () => setImportDialogOpen(true);
    const openImportFile = () => setImportFromFileOpen(true);
    window.addEventListener("fewer-add-node", openChild);
    window.addEventListener("fewer-add-node-standalone", openStandalone);
    window.addEventListener("fewer-import-folder", openImportFolder);
    window.addEventListener("fewer-import-file", openImportFile);
    return () => {
      window.removeEventListener("fewer-add-node", openChild);
      window.removeEventListener("fewer-add-node-standalone", openStandalone);
      window.removeEventListener("fewer-import-folder", openImportFolder);
      window.removeEventListener("fewer-import-file", openImportFile);
    };
  }, []);

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
        const { nodes, edges, hiddenFileIds } = treeToGraph(tree, { includeFiles: options.includeFiles });
        setGraph(nodes, edges, false, hiddenFileIds);
        useGraphStore.setState({ dataSource: "directory", includeFiles: options.includeFiles });
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
    [setGraph, toast],
  );

  const handleLoadSample = useCallback(() => {
    const { nodes, edges } = treeToGraph(SAMPLE_TREE, { idPrefix: "sample" });
    setGraph(nodes, edges, false);
    useGraphStore.setState({ dataSource: "sample" });
    toast({
      title: "Sample project loaded",
      description: "fewer",
    });
  }, [setGraph, toast]);

  const handleImportFromFile = useCallback(
    (tree: import("@/lib/fewer/types").TreeEntry) => {
      const { nodes, edges } = treeToGraph(tree, { idPrefix: "file-import" });
      setGraph(nodes, edges, false);
      useGraphStore.setState({ dataSource: "file" });
      toast({
        title: "Graph built from file",
        description: `${tree.name} — ${nodes.length} entries`,
      });
    },
    [setGraph, toast],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <GlobalNavbar onRestartTutorial={handleRestartTutorial} />
      <CanvasToolbar onLoadSample={handleLoadSample} />

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "hidden sm:block shrink-0 min-h-0 overflow-hidden transition-[width] duration-300 ease-out",
            sidebarOpen ? "w-[280px]" : "w-0",
          )}
        >
          <Sidebar
            onOpenDirectory={handleOpenDirectory}
            onImportFromFile={() => setImportFromFileOpen(true)}
          />
        </div>
        <div
          className={cn(
            "sm:hidden fixed inset-0 z-40 flex transition-[opacity,visibility] duration-300 ease-out",
            sidebarOpen ? "visible opacity-100" : "invisible opacity-0",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 ease-out",
              sidebarOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => useGraphStore.getState().setSidebarOpen(false)}
          />
          <div
            className={cn(
              "relative w-[280px] h-full transition-[transform] duration-300 ease-out",
              sidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar
              onOpenDirectory={handleOpenDirectory}
              onImportFromFile={() => setImportFromFileOpen(true)}
            />
          </div>
        </div>
        <main id="main-content" className="relative min-w-0 flex-1 min-h-0">
          <ErrorBoundary>
            <GraphCanvas />
          </ErrorBoundary>
          <BreadcrumbBar />
          <SearchPanel />
        </main>
      </div>

      <ExportPanel />
      <BugReportDialog />
      <TutorialDialog restartKey={tutorialRestartKey} />
      <ShortcutsDialog />
      <ShareDialog />

      <AddNodeDialog
        open={addChildOpen}
        onOpenChange={setAddChildOpen}
        mode="child"
      />
      <AddNodeDialog
        open={addStandaloneOpen}
        onOpenChange={setAddStandaloneOpen}
        mode="standalone"
      />

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
    </div>
  );
}