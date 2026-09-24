"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { ExportSettings } from "@/lib/fewer/types";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "@/lib/fewer/tutorial";

import { normalizeSidebarOrder, type AreaEditor } from "@/lib/fewer/sidebarOrder";

export type DialogsSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    searchOpen: boolean;
    exportOpen: boolean;
    sidebarOpen: boolean;
    sidebarOrder: AreaEditor[];
    advancedOpen: boolean;
    themeEditorOpen: boolean;
    bugReportOpen: boolean;
    shortcutsOpen: boolean;
    settingsOpen: boolean;
    shareOpen: boolean;
    authOpen: boolean;

    tutorialOpen: boolean;
    importFlowOpen: boolean;
    addChildOpen: boolean;
    addStandaloneOpen: boolean;
    addParentOpen: boolean;
    batchRenameOpen: boolean;
    batchTagOpen: boolean;
    parentPickerOpen: boolean;
    notificationOpen: boolean;

    advancedModeEnabled: boolean;
    showFiles: boolean;
    loading: boolean;
    exportSettings: ExportSettings;
    importOptions: ImportOptions;
    tutorialBeginnerDone: string[];
    tutorialDismissed: boolean;
    tutorialDemoStep: number;
    rightClickDetected: boolean;

    setSearchOpen: (open: boolean) => void;
    setExportOpen: (open: boolean) => void;
    setSidebarOpen: (open: boolean) => void;
    setSidebarOrder: (order: AreaEditor[]) => void;
    setAdvancedOpen: (open: boolean) => void;
    setThemeEditorOpen: (open: boolean) => void;
    setBugReportOpen: (open: boolean) => void;
    setShortcutsOpen: (open: boolean) => void;
    setSettingsOpen: (open: boolean) => void;
    setShareOpen: (open: boolean) => void;
    setAuthOpen: (open: boolean) => void;

    setTutorialOpen: (open: boolean) => void;
    setImportFlowOpen: (open: boolean) => void;
    setAddChildOpen: (open: boolean) => void;
    setAddStandaloneOpen: (open: boolean) => void;
    setAddParentOpen: (open: boolean) => void;
    setBatchRenameOpen: (open: boolean) => void;
    setBatchTagOpen: (open: boolean) => void;
    setParentPickerOpen: (open: boolean) => void;
    setNotificationOpen: (open: boolean) => void;

    setLoading: (loading: boolean) => void;
    setExportSettings: (settings: Partial<ExportSettings>) => void;
    setImportOptions: (options: ImportOptions) => void;
    markTutorialBeginnerStep: (id: string) => void;
    unmarkTutorialBeginnerStep: (id: string) => void;
    setTutorialDismissed: () => void;
    setTutorialDemoStep: (step: number) => void;
    setRightClickDetected: () => void;
    resetTutorial: () => void;
  }
>;

export const createDialogsSlice: DialogsSliceCreator = (set, get) => ({
  searchOpen: false,
  exportOpen: false,
  sidebarOpen: true,
  sidebarOrder: normalizeSidebarOrder(undefined),
  advancedOpen: false,
  themeEditorOpen: false,
  bugReportOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  shareOpen: false,
  authOpen: false,
  tutorialOpen: false,
  importFlowOpen: false,
  addChildOpen: false,
  addStandaloneOpen: false,
  addParentOpen: false,
  batchRenameOpen: false,
  batchTagOpen: false,
  parentPickerOpen: false,
  notificationOpen: false,
  advancedModeEnabled: false,
  showFiles: true,
  loading: false,
  exportSettings: { format: "svg", quality: 90, transparentBackground: false, includeStats: true, includeBranding: true },
  importOptions: { ...DEFAULT_IMPORT_OPTIONS },

  tutorialBeginnerDone: [] as string[],
  tutorialDismissed: false,
  tutorialDemoStep: 0,
  rightClickDetected: false,

  setSearchOpen: (open) => set({ searchOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarOrder: (order) => set({ sidebarOrder: order }),
  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  setThemeEditorOpen: (open) => set({ themeEditorOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),
  setAuthOpen: (open) => set({ authOpen: open }),
  setTutorialOpen: (open) => set({ tutorialOpen: open }),
  setImportFlowOpen: (open) => set({ importFlowOpen: open }),
  setAddChildOpen: (open) => set({ addChildOpen: open }),
  setAddStandaloneOpen: (open) => set({ addStandaloneOpen: open }),
  setAddParentOpen: (open) => set({ addParentOpen: open }),
  setBatchRenameOpen: (open) => set({ batchRenameOpen: open }),
  setBatchTagOpen: (open) => set({ batchTagOpen: open }),
  setParentPickerOpen: (open) => set({ parentPickerOpen: open }),
  setNotificationOpen: (open) => set({ notificationOpen: open }),
  setLoading: (loading) => set({ loading }),

  setExportSettings: (settings) => set((s) => ({ exportSettings: { ...s.exportSettings, ...settings } })),
  setImportOptions: (options) => set({ importOptions: options }),

  markTutorialBeginnerStep: (id) => {
    const done = get().tutorialBeginnerDone;
    if (done.includes(id)) return;
    const next = [...done, id];
    set({ tutorialBeginnerDone: next });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_BEGINNER_DONE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  },
  unmarkTutorialBeginnerStep: (id) => {
    const done = get().tutorialBeginnerDone;
    if (!done.includes(id)) return;
    const next = done.filter((d) => d !== id);
    set({ tutorialBeginnerDone: next });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_BEGINNER_DONE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  },
  setTutorialDismissed: () => {
    set({ tutorialDismissed: true });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_STORAGE_KEY, "true"); } catch { /* ignore */ } }
  },
  setTutorialDemoStep: (step) => set({ tutorialDemoStep: step }),
  setRightClickDetected: () => set({ rightClickDetected: true }),
  resetTutorial: () => {
    set({ tutorialBeginnerDone: [], tutorialDismissed: false, tutorialDemoStep: 0, rightClickDetected: false });
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(TUTORIAL_STORAGE_KEY); localStorage.removeItem(TUTORIAL_BEGINNER_DONE_KEY); } catch { /* ignore */ }
    }
  },
});

/**
 * Returns true when any blocking dialog/panel is currently on screen.
 * Search (slide-in panel) and sidebar (collapsible rail) are intentionally
 * excluded — they are transient UI chrome, not modal contexts, and should not
 * block keyboard shortcuts (PR #119).
 */
export function isAnyDialogOpen(s: GraphState): boolean {
  return !!(
    s.exportOpen ||
    s.advancedOpen ||
    s.themeEditorOpen ||
    s.bugReportOpen ||
    s.shortcutsOpen ||
    s.settingsOpen ||
    s.shareOpen ||
    s.authOpen ||
    s.tutorialOpen ||
    s.importFlowOpen ||
    s.addChildOpen ||
    s.addStandaloneOpen ||
    s.addParentOpen ||
    s.batchRenameOpen ||
    s.batchTagOpen ||
    s.parentPickerOpen ||
    s.notificationOpen
  );
}
