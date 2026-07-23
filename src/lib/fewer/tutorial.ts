import type { ComponentType } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface TutorialChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Store state to auto-detect completion. null = manual check. */
  watchState?: { key: string; value: unknown } | null;
  /** CSS selector for spotlight highlight. null = no highlight. */
  targetSelector?: string | null;
}

export interface ContextualTip {
  id: string;
  featureSelector: string;
  message: string;
  condition?: () => boolean;
}

/* -------------------------------------------------------------------------- */
/*  Checklist (5 steps)                                                       */
/* -------------------------------------------------------------------------- */

import {
  Sparkles,
  Layers,
  MousePointerClick,
  Search,
  Download,
} from "lucide-react";

export function getBeginnerChecklist(): TutorialChecklistItem[] {
  return [
    {
      id: "load-sample",
      label: "Load a sample project",
      description: "Click 'Load Sample' in the canvas toolbar to explore a pre-built directory tree",
      icon: Sparkles,
      watchState: { key: "dataSource", value: "sample" },
      targetSelector: '[data-tutorial="sample-button"]',
    },
    {
      id: "explore-nodes",
      label: "Explore folder & file nodes",
      description: "Click any node to select it. Folders show children inside.",
      icon: Layers,
      watchState: { key: "selectedNodeIds", value: null },
      targetSelector: null,
    },
    {
      id: "right-click",
      label: "Right-click for actions",
      description: "Right-click for context menu. Explore file, folder and canvas actions",
      icon: MousePointerClick,
      watchState: { key: "rightClickDetected", value: true },
      targetSelector: null,
    },
    {
      id: "search",
      label: "Search the graph",
      description: "Press Ctrl+F to find nodes by name or path",
      icon: Search,
      watchState: { key: "searchOpen", value: true },
      targetSelector: null,
    },
    {
      id: "export",
      label: "Export your graph",
      description: "Press Ctrl+E to export as PNG & ASCII tree",
      icon: Download,
      watchState: { key: "exportOpen", value: true },
      targetSelector: null,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Demo CSS keyframes                                                        */
/* -------------------------------------------------------------------------- */

export const DEMO_KEYFRAMES = `
@keyframes tutorial-node-enter {
  0% { opacity: 0; transform: scale(0.5) translateY(40px); }
  60% { opacity: 1; transform: scale(1.05) translateY(-4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes tutorial-node-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4); }
  50% { box-shadow: 0 0 0 12px rgba(34, 211, 238, 0); }
}

@keyframes tutorial-fade-in {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes tutorial-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes tutorial-bounce-in {
  0% { opacity: 0; transform: scale(0.3); }
  50% { opacity: 1; transform: scale(1.08); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
`;

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

export const TUTORIAL_STORAGE_KEY = "fewer-tutorial-dismissed";
export const TUTORIAL_BEGINNER_DONE_KEY = "fewer-tutorial-beginner-done";