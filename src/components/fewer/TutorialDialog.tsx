"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  SkipForward,
  MousePointerClick,
  FolderOpen,
  Search,
  Download,
  Palette,
  Layers,
  GripVertical,
  Keyboard,
  Sparkles,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ActionType = "click" | "keypress" | "none";

interface TutorialStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** CSS selector for the element to highlight. null = no highlight. */
  targetSelector?: string | null;
  /** Action the user must complete to proceed. */
  actionType: ActionType;
  /** Instructions for the required action. */
  actionHint?: string;
  /** Key to press for "keypress" action. */
  actionKey?: string;
  /** Store state to watch for completion (e.g. "searchOpen" → true). */
  watchState?: { key: string; value: unknown } | null;
  /** Optional tips. */
  tips?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Steps                                                                     */
/* -------------------------------------------------------------------------- */

const STEPS: TutorialStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to fewer",
    description:
      "This interactive walkthrough will guide you through the key features. You'll click buttons, press keys, and explore the app as you learn. Let's start!",
    targetSelector: null,
    actionType: "none",
    tips: [
      "Click 'Next' to begin the walkthrough",
      "You can skip anytime — the tutorial won't show again",
    ],
  },
  {
    icon: Plus,
    title: "Load a Sample Project",
    description:
      "Let's load a demo project so you have something to explore. Click the 'Sample' button in the toolbar above.",
    targetSelector:
      'button:has(> span:contains("Sample")), button[title*="Sample"]',
    actionType: "click",
    actionHint: "Click the 'Sample' button in the toolbar",
    watchState: null,
    tips: [
      "This loads a pre-built project tree so you can explore immediately",
    ],
  },
  {
    icon: Layers,
    title: "Explore Folder & File Nodes",
    description:
      "The graph shows folder cards (orange) with their children listed inside, and file cards (purple) showing filename and size. Click any node on the canvas to select it.",
    targetSelector: ".react-flow__node",
    actionType: "none",
    actionHint: "Click any node on the canvas to select it",
    watchState: { key: "selectedNodeIds", value: null },
    tips: [
      "Scroll inside folder cards to see more children",
      "Right-click any node for a context menu with actions",
    ],
  },
  {
    icon: MousePointerClick,
    title: "Right-Click for Context Menus",
    description:
      "Right-click on any folder node to see actions like Rename, Add Child Node, Copy Path, and Hide Node. Try right-clicking a node now.",
    targetSelector: ".react-flow__node",
    actionType: "none",
    actionHint: "Right-click any node to open its context menu",
    tips: [
      "Folders: Rename, Add Child, Copy Path, Refresh, Copy, Cut, Hide",
      "Files: Rename, Open File, Copy Name, Copy, Cut, Delete",
    ],
  },
  {
    icon: GripVertical,
    title: "Resize & Drag Nodes",
    description:
      "Select a node to see cyan resize handles. Folders resize in all directions, files only horizontally. Try dragging a resize handle on a selected node.",
    targetSelector: ".react-flow__node.selected",
    actionType: "none",
    actionHint: "Select a node and drag the cyan resize handles",
    tips: ["You can also drag nodes anywhere on the canvas to reposition them"],
  },
  {
    icon: Search,
    title: "Search the Graph",
    description:
      "Press Ctrl+F to open the search panel. Try it now — type a filename and click a result to zoom to that node.",
    targetSelector: null,
    actionType: "keypress",
    actionKey: "f",
    actionHint: "Press Ctrl+F to open search",
    watchState: { key: "searchOpen", value: true },
    tips: [
      "Search matches filenames, paths, and extensions",
      "Click any result to zoom to that node",
    ],
  },
  {
    icon: Keyboard,
    title: "Keyboard Navigation",
    description:
      "Use arrow keys to navigate the tree: ↑ for parent, ↓ for first child, ← → for siblings. Press H to hide a node, Shift+H to unhide. Try pressing an arrow key now.",
    targetSelector: ".react-flow__node",
    actionType: "none",
    actionHint: "Press any arrow key to navigate between nodes",
    watchState: { key: "focusedNodeId", value: null },
    tips: [
      "F2 renames · Enter opens files · Delete removes · H hides · Shift+H unhides",
    ],
  },
  {
    icon: Palette,
    title: "Layout & Appearance",
    description:
      "The sidebar has layout direction buttons (TB/LR/BT/RL), edge styles, node size sliders, and theme controls. Open the Layout section in the sidebar to explore.",
    targetSelector: "aside",
    actionType: "none",
    actionHint: "Explore the Layout and Appearance sections in the sidebar",
    tips: [
      "Click 'Beautify Layout' to auto-arrange nodes",
      "Switch to Custom theme to control folder and file colors independently",
    ],
  },
  {
    icon: Download,
    title: "Export Your Graph",
    description:
      "Export to SVG, PNG, JSON, CSV, DOT, Directory Script, or Directory Tree. Press Ctrl+E to open the export panel.",
    targetSelector: null,
    actionType: "keypress",
    actionKey: "e",
    actionHint: "Press Ctrl+E to open the export panel",
    watchState: { key: "exportOpen", value: true },
    tips: [
      "Toggle 'Export selected only' to export just a subtree",
      "JSON exports can be re-imported via 'Import from File'",
    ],
  },
  {
    icon: Keyboard,
    title: "View All Shortcuts Anytime",
    description:
      "Press Ctrl+I anytime to see all keyboard shortcuts. You're all set — happy exploring!",
    targetSelector: null,
    actionType: "none",
    actionHint: "Remember: Ctrl+I shows all shortcuts",
    tips: ["Click 'Done' to finish the tutorial"],
  },
];

/* -------------------------------------------------------------------------- */
/*  Spotlight overlay                                                         */
/* -------------------------------------------------------------------------- */

function SpotlightOverlay({
  targetSelector,
  onDismiss,
}: {
  targetSelector: string | null | undefined;
  onDismiss: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!targetSelector) {
      // Use a microtask to avoid synchronous setState in effect
      Promise.resolve().then(() => setRect(null));
      return;
    }

    const update = () => {
      try {
        const el = document.querySelector(targetSelector);
        if (el) {
          setRect(el.getBoundingClientRect());
        } else {
          setRect(null);
        }
      } catch {
        setRect(null);
      }
    };

    update();
    // Continuously update in case of layout shifts / animations
    const interval = setInterval(update, 200);

    return () => {
      clearInterval(interval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetSelector]);

  if (!rect) {
    // No target — full overlay with click-to-dismiss disabled
    return (
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const padding = 8;
  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      style={{
        boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.55)`,
        borderRadius: "12px",
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
        border: "2px solid rgb(34, 211, 238)",
        transition: "all 300ms ease",
      }}
    >
      {/* Pulsing ring */}
      <div
        className="absolute inset-0 rounded-xl animate-pulse"
        style={{
          boxShadow: "0 0 20px 4px rgba(34, 211, 238, 0.4)",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Tutorial Dialog                                                      */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "fewer-tutorial-completed";

export function TutorialDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [actionCompleted, setActionCompleted] = useState(false);
  const store = useGraphStore();

  // Show tutorial only AFTER welcome dialog is dismissed
  const welcomeOpen = true; // We'll use a callback instead

  // Track if welcome was closed
  const [welcomeWasOpen, setWelcomeWasOpen] = useState(true);

  // Watch the DOM for the welcome dialog closing
  useEffect(() => {
    const checkWelcome = () => {
      const welcomeDialog =
        document.querySelector("[data-testid='welcome-dialog']") ||
        document.querySelector(
          '[role="dialog"]:has(> div > div > h2:contains("fewer"))',
        );
      const welcomeVisible = !!document.querySelector('[role="dialog"]');

      // Simpler approach: check if the welcome dialog's "Load sample" or "Open" button is visible
      const welcomeButtons = Array.from(
        document.querySelectorAll("button"),
      ).filter(
        (b) =>
          b.textContent?.includes("Load sample") ||
          b.textContent?.includes("Open my directory") ||
          b.textContent?.includes("Start exploring"),
      );

      if (welcomeWasOpen && welcomeButtons.length === 0) {
        // Welcome was open but now it's gone
        setWelcomeWasOpen(false);
        // Check if tutorial should show
        try {
          const completed = localStorage.getItem(STORAGE_KEY);
          if (!completed) {
            const t = setTimeout(() => setOpen(true), 800);
            return () => clearTimeout(t);
          }
        } catch {
          // ignore
        }
      }
    };

    const interval = setInterval(checkWelcome, 500);
    return () => clearInterval(interval);
  }, [welcomeWasOpen]);

  // Watch store state for action completion
  useEffect(() => {
    if (!open) return;
    const current = STEPS[step];
    if (!current.watchState) {
      Promise.resolve().then(() =>
        setActionCompleted(current.actionType === "none"),
      );
      return;
    }

    // Watch for state changes
    const unsubscribe = useGraphStore.subscribe((state) => {
      const { key, value } = current.watchState!;
      const stateValue = (state as unknown as Record<string, unknown>)[key];
      if (value === null) {
        // For "changed from initial" checks (e.g. selectedNodeIds length > 0, focusedNodeId !== null)
        if (
          key === "selectedNodeIds" &&
          Array.isArray(stateValue) &&
          stateValue.length > 0
        ) {
          setActionCompleted(true);
        } else if (key === "focusedNodeId" && stateValue !== null) {
          setActionCompleted(true);
        } else if (key === "searchOpen" && stateValue === true) {
          setActionCompleted(true);
        } else if (key === "exportOpen" && stateValue === true) {
          setActionCompleted(true);
        }
      } else if (stateValue === value) {
        setActionCompleted(true);
      }
    });

    return () => unsubscribe();
  }, [open, step]);

  const handleClose = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      setActionCompleted(false);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
      setActionCompleted(false);
    }
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const canProceed = current.actionType === "none" || actionCompleted;

  // Position the tooltip near the highlighted element, or center if none
  const tooltipPosition = current.targetSelector ? "bottom-right" : "center";

  return (
    <>
      {/* Spotlight overlay */}
      <SpotlightOverlay
        targetSelector={current.targetSelector}
        onDismiss={() => {}}
      />

      {/* Tooltip / instructions */}
      <div
        className={cn(
          "fixed z-[70] w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/40 bg-card/95 p-5 shadow-2xl backdrop-blur-xl",
          tooltipPosition === "center"
            ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            : "bottom-4 right-4",
        )}
      >
        {/* Progress bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step
                    ? "w-6 bg-orange-500"
                    : i < step
                      ? "w-1.5 bg-orange-400/50"
                      : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Skip button */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close tutorial"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 border border-border/40">
            <Icon className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-sm font-bold">{current.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {current.description}
            </p>
          </div>
        </div>

        {/* Action hint */}
        {current.actionType !== "none" && current.actionHint && (
          <div
            className={cn(
              "mt-3 flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors",
              actionCompleted
                ? "border-green-400/40 bg-green-500/10 text-green-300"
                : "border-cyan-400/40 bg-cyan-500/10 text-cyan-300",
            )}
          >
            {actionCompleted ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <MousePointerClick className="h-3.5 w-3.5 shrink-0 animate-pulse" />
            )}
            <span>
              {actionCompleted ? "Done! " : ""}
              {current.actionHint}
            </span>
          </div>
        )}

        {/* Tips */}
        {current.tips && current.tips.length > 0 && (
          <div className="mt-3 space-y-1">
            {current.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80"
              >
                <span className="mt-0.5 text-orange-400">›</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-[10px] text-muted-foreground"
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              className="gap-1 text-xs"
            >
              <ChevronLeft className="h-3 w-3" />
              Back
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canProceed}
            className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 text-xs"
          >
            {isLast ? (
              <>
                <Check className="h-3 w-3" />
                Done!
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
