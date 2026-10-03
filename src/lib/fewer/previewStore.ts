// Preview panel state (T-091 / #303): which file the canvas wants previewed.
// Tiny standalone store — the panel mounts once in FewerApp.
import { create } from "zustand";

export interface PreviewTarget {
  nodeId: string;
  /** Absolute path on this machine (resolved before opening). */
  path: string;
  name: string;
}

interface PreviewState {
  target: PreviewTarget | null;
  openPreview: (t: PreviewTarget) => void;
  closePreview: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  target: null,
  openPreview: (t) => set({ target: t }),
  closePreview: () => set({ target: null }),
}));
