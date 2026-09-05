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
import type { ImportOrigin } from "@/lib/fewer/importFlow";
import { useToast } from "@/hooks/use-toast";
import { useDevice } from "@/hooks/use-device";
import { useAuth } from "@/hooks/use-auth";
import { useSettingsSync } from "@/hooks/use-settings";
import { loadSettingsLocal } from "@/lib/fewer/userSettings";
import { applySnapshot, loadGraphLocal, saveGraphLocal } from "@/lib/fewer/snapshot";
import { cn } from "@/lib/utils";
import { FEWER_ADD_NODE, FEWER_ADD_NODE_PARENT, FEWER_ADD_NODE_STANDALONE, FEWER_IMPORT_FOLDER } from "@/lib/fewer/keyboardShortcuts";
import { GlobalNavbar } from "./GlobalNavbar";
import { CanvasToolbar } from "./CanvasToolbar";
import { TreeRenderer } from "./TreeRenderer";
import { SectionDragLayer } from "./SectionDragLayer";

// Dialogs lazy-loaded: only fetched when opened. Keeps react-colorful,
// export libs, and dialog code out of the startup bundle.
const ExportPanel = dynamic(() => import("./ExportPanel").then((m) => m.ExportPanel), { ssr: false });
const ImportFlowDialog = dynamic(() => import("./ImportFlowDialog").then((m) => m.ImportFlowDialog), { ssr: false });
const BugReportDialog = dynamic(() => import("./BugReportDialog").then((m) => m.BugReportDialog), { ssr: false });
const TutorialDialog = dynamic(() => import("./TutorialDialog").then((m) => m.TutorialDialog), { ssr: false });
const ShortcutsDialog = dynamic(() => import("./ShortcutsDialog").then((m) => m.ShortcutsDialog), { ssr: false });
const SettingsDialog = dynamic(() => import("./SettingsDialog").then((m) => m.SettingsDialog), { ssr: false });
const ShareDialog = dynamic(() => import("./ShareDialog").then((m) => m.ShareDialog), { ssr: false });
const ThemeEditorDialog = dynamic(() => import("./ThemeEditorDialog").then((m) => m.ThemeEditorDialog), { ssr: false });
const AddNodeDialog = dynamic(() => import("./AddNodeDialog").then((m) => m.AddNodeDialog), { ssr: false });
const BatchRenameDialog = dynamic(() => import("./BatchRenameDialog").then((m) => m.BatchRenameDialog), { ssr: false });
const ParentPickerDialog = dynamic(() => import("./ParentPickerDialog").then((m) => m.ParentPickerDialog), { ssr: false });
const NotificationPanel = dynamic(() => import("./NotificationPanel").then((m) => m.NotificationPanel), { ssr: false });
const AuthDialog = dynamic(() => import("./AuthDialog").then((m) => m.AuthDialog), { ssr: false });

export function FewerApp() {
  // Cloud + local persistence of the user's app settings (theme, layout,
  // display, import/export prefs, sidebar).
  useSettingsSync();
  const setGraph = useGraphStore((s) => s.setGraph);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);
  const { toast } = useToast();
  const device = useDevice();
  const { user } = useAuth();

  const [importFlowOpen, setImportFlowOpen] = useState(false);
  const [importFlowOrigin, setImportFlowOrigin] = useState<ImportOrigin>("folder");
  const [importFlowMounted, setImportFlowMounted] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [addStandaloneOpen, setAddStandaloneOpen] = useState(false);
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [tutorialRestartKey, setTutorialRestartKey] = useState(0);
  const [hashLoaded, setHashLoaded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [notifOpen, setNotifOpen] = useState(false);
  const authOpen = useGraphStore((s) => s.authOpen);
  const setAuthOpen = useGraphStore((s) => s.setAuthOpen);
  const resizingRef = useRef(false);

  // Panel layout
  const sidebarSide = useGraphStore((s) => s.sidebarSide);
  const panelTree = useGraphStore((s) => s.panelTree);

  // On mobile, start with sidebar closed
  useEffect(() => {
    if (device.isMobile) {
      setSidebarOpen(false);
    }
  }, [device.isMobile, setSidebarOpen]);

  // On mobile, the minimap defaults to OFF — but only when the user hasn't saved
  // a preference yet (mirroring the Sidebar's responsive-direction default), so
  // a deliberate toggle (local or cloud) is never clobbered. The store keeps the
  // isomorphic `true` default to avoid an SSR/client hydration mismatch; this
  // effect applies the responsive default once on the client.
  useEffect(() => {
    if (!device.isMobile) return;
    const saved = loadSettingsLocal();
    if (!saved || saved.showMiniMap === undefined) {
      useGraphStore.setState({ showMiniMap: false });
    }
  }, [device.isMobile]);

  // Initialize theme on mount: respect a saved preference, otherwise follow the
  // device scheme (resolved to light/dark). Syncing the store keeps the
  // Appearance selector matched to the theme actually applied.
  useEffect(() => {
    const saved = localStorage.getItem("fewer-theme") as string | null;
    if (saved === "light" || saved === "dark" || saved === "custom") {
      useGraphStore.getState().setThemeMode(saved);
    } else if (typeof window !== "undefined") {
      const deviceMode =
        window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      // Derive but don't persist: keep following the device until the user
      // explicitly picks a theme in Settings.
      useGraphStore.setState({ themeMode: deviceMode });
    }
  }, []);

  // Advanced power-user options are available only to signed-in users.
  // The old PowerUserToggle is gone; the flag now tracks auth. Drive the
  // store flag directly (not via a reset-triggering setter) so a logged-in
  // user's theme/settings are never wiped on sign-in/out.
  useEffect(() => {
    useGraphStore.setState({ advancedModeEnabled: !!user });
  }, [user]);

  // Sidebar drag-resize handler — adapts to left/right side
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = sidebarSide === "left"
        ? Math.min(560, Math.max(200, e.clientX))
        : Math.min(560, Math.max(200, window.innerWidth - e.clientX));
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
  }, [sidebarSide]);

  const startResize = useCallback(() => {
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Load shared graph from URL hash (embedded) or DB-backed short link (#s:<id>)
  useEffect(() => {
    if (hashLoaded) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;

    const applyData = (data: { nodes: unknown[]; edges: unknown[]; localRootPath?: string | null }) => {
      // Graph data only — the viewer's app settings (direction, edge style,
      // theme, corner radius, …) are theirs and are NOT overwritten by a shared
      // graph. Node positions are preserved via preservePositions (no re-layout).
      useGraphStore.getState().setGraph(data.nodes as never, data.edges as never, false, undefined, { preservePositions: true });
      useGraphStore.setState({
        dataSource: "shared",
        localRootPath: data.localRootPath ?? null,
      });
      setHashLoaded(true);
      // Clear hash from address bar
      window.history.replaceState(null, "", window.location.pathname);
      toast({
        title: "Shared graph loaded",
        description: `${(data.nodes as unknown[]).length} node${(data.nodes as unknown[]).length === 1 ? "" : "s"} from share link`,
      });
    };

    import("@/lib/fewer/share").then(async ({ decodeShareData, isDbShareHash, parseDbShareId }) => {
      // Invite token link: #i:<token> — token is the credential, no login.
      if (hash.startsWith("i:")) {
        const token = hash.slice(2);
        if (!token) {
          toast({ title: "Invalid invite link", description: "Could not load the graph.", variant: "destructive" });
          return;
        }
        try {
          const res = await fetch(`/api/share/invite/${token}`);
          const json = await res.json();
          if (!res.ok || !json.data) {
            toast({ title: "Invite link invalid", description: json.error || "Could not load the graph.", variant: "destructive" });
            return;
          }
          applyData(json.data);
        } catch {
          toast({ title: "Invite link error", description: "Could not load the graph from the server.", variant: "destructive" });
        }
        return;
      }

      if (isDbShareHash(hash)) {
        const id = parseDbShareId(hash);
        if (!id) {
          toast({ title: "Invalid share link", description: "Could not load the graph from the URL.", variant: "destructive" });
          return;
        }
        try {
          const res = await fetch(`/api/share/${id}`);
          const json = await res.json();
          if (!res.ok || !json.data) {
            if (res.status === 403) {
              toast({ title: "Invite-only graph", description: json.error || "Sign in with an invited email to view it.", variant: "destructive" });
              setAuthOpen(true);
            } else {
              toast({ title: "Share link expired", description: json.error || "Could not load the graph.", variant: "destructive" });
            }
            return;
          }
          applyData(json.data);
        } catch {
          toast({ title: "Share link error", description: "Could not load the graph from the server.", variant: "destructive" });
        }
        return;
      }

      const data = decodeShareData(hash);
      if (!data) {
        toast({
          title: "Invalid share link",
          description: "Could not decode the graph from the URL.",
          variant: "destructive",
        });
        return;
      }
      applyData(data);
    });
  }, [hashLoaded, toast]);

  // Restore the last graph from localStorage on mount — unless a share/saved
  // link hash is present, which loads its own graph and wins over the generic
  // local cache. Settings are applied separately (useSettingsSync); a graph
  // load never touches settings, so there's no ordering hazard.
  useEffect(() => {
    if (hashLoaded) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) return;
    const local = loadGraphLocal();
    if (!local) return;
    try {
      applySnapshot(local.data, { source: local.dataSource ?? "local" });
    } catch {
      /* corrupt/incompatible cache — start fresh */
    }
  }, [hashLoaded]);

  // Persist the current graph (nodes/edges/dataSource/localRootPath) to
  // localStorage so a reload restores the canvas. Debounced: dragging nodes
  // commits a store update per frame, so writes are batched. Empty graph →
  // saveGraphLocal removes the key (covers Clear canvas).
  const graphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsub = useGraphStore.subscribe((state, prev) => {
      if (
        state.nodes === prev.nodes &&
        state.edges === prev.edges &&
        state.dataSource === prev.dataSource &&
        state.localRootPath === prev.localRootPath
      ) {
        return;
      }
      if (graphTimerRef.current) clearTimeout(graphTimerRef.current);
      graphTimerRef.current = setTimeout(() => {
        const s = useGraphStore.getState();
        saveGraphLocal({ nodes: s.nodes, edges: s.edges, tags: s.tags, dataSource: s.dataSource, localRootPath: s.localRootPath });
      }, 500);
    });
    return () => {
      if (graphTimerRef.current) clearTimeout(graphTimerRef.current);
      unsub();
    };
  }, []);

  // Handle OAuth callback query params (?cloud=connected|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cloud = params.get("cloud");
    if (cloud === "connected") {
      const provider = params.get("provider");
      toast({ title: "Cloud account linked", description: provider ? `${provider} connected.` : "Cloud account linked." });
      window.history.replaceState(null, "", window.location.pathname);
    } else if (cloud === "error") {
      toast({ title: "Cloud connection failed", description: params.get("msg") || "Unknown error", variant: "destructive" });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [toast]);

  // Every import entry point opens the SAME 3-step flow; only the
  // preselected origin differs.
  const openImportFlow = useCallback((origin: ImportOrigin) => {
    setImportFlowOrigin(origin);
    setImportFlowOpen(true);
  }, []);

  // Listen for keyboard shortcuts and sidebar button clicks to open dialogs
  useEffect(() => {
    const openChild = () => setAddChildOpen(true);
    const openStandalone = () => setAddStandaloneOpen(true);
    const openParent = () => setAddParentOpen(true);
    const openImportFolder = () => openImportFlow("folder");
    const restartTutorial = () => setTutorialRestartKey((k) => k + 1);
    window.addEventListener(FEWER_ADD_NODE, openChild);
    window.addEventListener(FEWER_ADD_NODE_STANDALONE, openStandalone);
    window.addEventListener(FEWER_ADD_NODE_PARENT, openParent);
    window.addEventListener(FEWER_IMPORT_FOLDER, openImportFolder);
    window.addEventListener("fewer-restart-tutorial", restartTutorial);
    return () => {
      window.removeEventListener(FEWER_ADD_NODE, openChild);
      window.removeEventListener(FEWER_ADD_NODE_STANDALONE, openStandalone);
      window.removeEventListener(FEWER_ADD_NODE_PARENT, openParent);
      window.removeEventListener(FEWER_IMPORT_FOLDER, openImportFolder);
      window.removeEventListener("fewer-restart-tutorial", restartTutorial);
    };
  }, [openImportFlow]);

  const handleLoadSample = useCallback(() => {
    const { nodes, edges } = treeToGraph(SAMPLE_TREE, { idPrefix: "sample" });
    useGraphStore.setState({ dataSource: "sample", maxDisplayDepth: 6, localRootPath: null });
    setGraph(nodes, edges, false);
    toast({
      title: "Sample project loaded",
      description: "fewer",
    });
  }, [setGraph, toast]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <GlobalNavbar onToggleNotifications={() => setNotifOpen((o) => !o)} onOpenAuth={() => setAuthOpen(true)} />
      <CanvasToolbar onLoadSample={handleLoadSample} />

      <div className="flex min-h-0 flex-1">
        {/* Sidebar wrapper — positioned by sidebarSide */}
        <div
          className="relative hidden sm:block shrink-0 min-h-0 overflow-hidden"
          style={{
            width: sidebarOpen ? sidebarWidth : 0,
            order: sidebarSide === "right" ? 999 : 0,
          }}
        >
          <Sidebar
            onOpenDirectory={() => openImportFlow("folder")}
            onRequireAuth={() => setAuthOpen(true)}
          />
          {sidebarOpen && (
            <div
              onMouseDown={startResize}
              className={cn(
                "absolute top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-border/80 transition-colors",
                sidebarSide === "left" ? "right-0" : "left-0",
              )}
              title="Drag to resize"
              aria-label="Resize sidebar"
            />
          )}
        </div>

        {/* Mobile sidebar overlay */}
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
            onOpenDirectory={() => openImportFlow("folder")}
            onRequireAuth={() => setAuthOpen(true)}
          />
          </div>
        </div>

        {/* Tree-based layout: all areas including canvas */}
        <TreeRenderer
          tree={panelTree}
          onOpenImport={() => openImportFlow("folder")}
          onLoadSample={handleLoadSample}
        />
      </div>

      {/* Drag-to-dock overlay (ghost + edge strips) */}
      <SectionDragLayer />

      <ExportPanel />
      <BatchRenameDialog />
      <ParentPickerDialog />
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <BugReportDialog />
      <TutorialDialog restartKey={tutorialRestartKey} />
      <ShortcutsDialog />
      <SettingsDialog />
      <ThemeEditorDialog />
      <ShareDialog />
    {/* Lazy-mount once, then keep alive across minimize so the dock pill can render.
        Shell hooks (useAuth/useWatch) still defer until first open. */}
    {(importFlowMounted || importFlowOpen) && (
      <ImportFlowDialog
        open={importFlowOpen}
        onOpenChange={setImportFlowOpen}
        initialOrigin={importFlowOrigin}
        onFirstOpen={() => setImportFlowMounted(true)}
      />
    )}

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
      <AddNodeDialog
        open={addParentOpen}
        onOpenChange={setAddParentOpen}
        mode="parent"
      />

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}