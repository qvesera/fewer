"use client";
import { StateCreator } from "zustand";
import type { GraphState } from "../types";
import type { ExportSettings } from "@/lib/fewer/types";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "@/lib/fewer/tutorial";

export type DialogsSliceCreator = StateCreator<
  GraphState,
  [],
  [],
  {
    searchOpen: boolean;
    exportOpen: boolean;
    sidebarOpen: boolean;
    advancedOpen: boolean;
    themeEditorOpen: boolean;
    bugReportOpen: boolean;
    shortcutsOpen: boolean;
    settingsOpen: boolean;
    shareOpen: boolean;
    authOpen: boolean;
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
    setAdvancedOpen: (open: boolean) => void;
    setThemeEditorOpen: (open: boolean) => void;
    setBugReportOpen: (open: boolean) => void;
    setShortcutsOpen: (open: boolean) => void;
    setSettingsOpen: (open: boolean) => void;
    setShareOpen: (open: boolean) => void;
    setAuthOpen: (open: boolean) => void;
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
  advancedOpen: false,
  themeEditorOpen: false,
  bugReportOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  shareOpen: false,
  authOpen: false,
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
  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  setThemeEditorOpen: (open) => set({ themeEditorOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),
  setAuthOpen: (open) => set({ authOpen: open }),
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
