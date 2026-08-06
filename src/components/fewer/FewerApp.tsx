"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Sidebar,
  SearchPanel,
  ErrorBoundary,
  GraphCanvas,
  BreadcrumbBar,
} from ".";
import { useGraphStore } from "@/store/graphStore";
import { treeToGraph } from "@/lib/fewer/treeToGraph";
import { SAMPLE_TREE } from "@/lib/fewer/sampleData";
import {
  pickDirectoryTree,
  isFileSystemAccessSupported,
} from "@/lib/fewer/fileSystem";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/hooks/use-device";
import { cn } from "@/lib/utils";
import { GlobalNavbar } from "./GlobalNavbar";
import { CanvasToolbar } from "./CanvasToolbar";

// Dialogs lazy-loaded: only fetched when opened. Keeps react-colorful,
// export libs, and dialog code out of the startup bundle.
const ExportPanel = dynamic(() => import("./ExportPanel").then((m) => m.ExportPanel), { ssr: false });
const ImportDialog = dynamic(() => import("./ImportDialog").then((m) => m.ImportDialog), { ssr: false });
const ImportFromFileDialog = dynamic(() => import("./ImportFromFileDialog").then((m) => m.ImportFromFileDialog), { ssr: false });
const BugReportDialog = dynamic(() => import("./BugReportDialog").then((m) => m.BugReportDialog), { ssr: false });
const TutorialDialog = dynamic(() => import("./TutorialDialog").then((m) => m.TutorialDialog), { ssr: false });
const ShortcutsDialog = dynamic(() => import("./ShortcutsDialog").then((m) => m.ShortcutsDialog), { ssr: false });
const SettingsDialog = dynamic(() => import("./SettingsDialog").then((m) => m.SettingsDialog), { ssr: false });
const ShareDialog = dynamic(() => import("./ShareDialog").then((m) => m.ShareDialog), { ssr: false });
const ThemeEditorDialog = dynamic(() => import("./ThemeEditorDialog").then((m) => m.ThemeEditorDialog), { ssr: false });
const AddNodeDialog = dynamic(() => import("./AddNodeDialog").then((m) => m.AddNodeDialog), { ssr: false });
const ImportUrlDialog = dynamic(() => import("./ImportUrlDialog").then((m) => m.ImportUrlDialog), { ssr: false });
const NotificationPanel = dynamic(() => import("./NotificationPanel").then((m) => m.NotificationPanel), { ssr: false });

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
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [hashLoaded, setHashLoaded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [notifOpen, setNotifOpen] = useState(false);
  const resizingRef = useRef(false);

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

  // Sidebar drag-resize handler
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = Math.min(560, Math.max(200, e.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback(() => {
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
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
      if (data.customTheme) {
        useGraphStore.getState().setCustomTheme(data.customTheme as any);
      }
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
    const openImportUrl = () => setImportUrlOpen(true);
    const restartTutorial = () => setTutorialRestartKey((k) => k + 1);
    window.addEventListener("fewer-add-node", openChild);
    window.addEventListener("fewer-add-node-standalone", openStandalone);
    window.addEventListener("fewer-import-folder", openImportFolder);
    window.addEventListener("fewer-import-file", openImportFile);
    window.addEventListener("fewer-import-url", openImportUrl);
    window.addEventListener("fewer-restart-tutorial", restartTutorial);
    return () => {
      window.removeEventListener("fewer-add-node", openChild);
      window.removeEventListener("fewer-add-node-standalone", openStandalone);
      window.removeEventListener("fewer-import-folder", openImportFolder);
      window.removeEventListener("fewer-import-file", openImportFile);
      window.removeEventListener("fewer-import-url", openImportUrl);
      window.removeEventListener("fewer-restart-tutorial", restartTutorial);
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
        useGraphStore.setState({ dataSource: "directory", includeFiles: options.includeFiles, maxDisplayDepth: options.displayMaxDepth });
        setGraph(nodes, edges, false, hiddenFileIds);
        setImportDialogOpen(false);
        toast({
          title: "Directory loaded",
          description: `${tree.name}: ${nodes.length} entries`,
        });
        await new Promise((r) => setTimeout(r, 20));
        const autoHidden = useGraphStore.getState().autoHideCount;
        if (autoHidden > 0) {
          const threshold = useGraphStore.getState().autoHideThreshold;
          toast({
            title: "Large folders collapsed",
            description: `${autoHidden} item${autoHidden === 1 ? " was" : "s were"} auto-hidden (folders with more than ${threshold} children). Use Hidden Nodes in the sidebar to reveal them.`,
          });
        }
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
    useGraphStore.setState({ dataSource: "sample", maxDisplayDepth: 6 });
    setGraph(nodes, edges, false);
    toast({
      title: "Sample project loaded",
      description: "fewer",
    });
  }, [setGraph, toast]);

  const handleImportFromUrl = useCallback(() => {
    setImportUrlOpen(true);
  }, []);

  const handleImportFromFile = useCallback(
    (tree: import("@/lib/fewer/types").TreeEntry) => {
      const { nodes, edges } = treeToGraph(tree, { idPrefix: "file-import" });
      useGraphStore.setState({ dataSource: "file", maxDisplayDepth: DEFAULT_IMPORT_OPTIONS.displayMaxDepth });
      setGraph(nodes, edges, false);
      toast({
        title: "Graph built from file",
        description: `${tree.name}: ${nodes.length} entries`,
      });
    },
    [setGraph, toast],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <GlobalNavbar onToggleNotifications={() => setNotifOpen((o) => !o)} />
      <CanvasToolbar onLoadSample={handleLoadSample} />

      <div className="flex min-h-0 flex-1">
        <div
          className="relative hidden sm:block shrink-0 min-h-0 overflow-hidden"
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        >
          <Sidebar
            onOpenDirectory={handleOpenDirectory}
            onImportFromFile={() => setImportFromFileOpen(true)}
            onImportFromUrl={handleImportFromUrl}
          />
          {sidebarOpen && (
            <div
              onMouseDown={startResize}
              className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-border/80 transition-colors"
              title="Drag to resize"
              aria-label="Resize sidebar"
            />
          )}
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
            onImportFromUrl={handleImportFromUrl}
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
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <BugReportDialog />
      <TutorialDialog restartKey={tutorialRestartKey} />
      <ShortcutsDialog />
      <SettingsDialog />
      <ThemeEditorDialog />
      <ShareDialog />
      <ImportUrlDialog open={importUrlOpen} onOpenChange={setImportUrlOpen} />

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