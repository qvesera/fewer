"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  MousePointerClick,
  FolderOpen,
  Search,
  Download,
  Palette,
  SlidersHorizontal,
  Layers,
  GripVertical,
  Bug,
  Keyboard,
  Sparkles,
  X,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tips?: string[];
}

const STEPS: TutorialStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Graphir Pro Max Ultra",
    description:
      "Transform your file system navigation into an art form. This interactive graph visualizer lets you explore, edit, and export directory structures with power-user features.",
    tips: ["Click 'Next' to walk through the key features", "You can skip this tutorial anytime — it won't show again"],
  },
  {
    icon: FolderOpen,
    title: "Import a Directory",
    description:
      "Click 'Import Folder' in the sidebar to load a real directory from your file system (Chrome/Edge). Or click 'Import from File' to build a graph from a JSON export, ASCII tree, or shell script.",
    tips: [
      "Configure import depth, hidden files, and extension filters before importing",
      "Use 'Sample' in the toolbar to load a demo project instantly",
      "The webkitdirectory fallback works in Firefox/Safari",
    ],
  },
  {
    icon: MousePointerClick,
    title: "Navigate the Graph",
    description:
      "Click any node to select it. Drag nodes to reposition them freely. Use the minimap (bottom-right) for quick navigation. Scroll to zoom, drag empty space to pan.",
    tips: [
      "Arrow keys navigate the tree: ↑=parent, ↓=child, ←/→=siblings",
      "Space fits the whole graph in view",
      "+/- keys zoom in and out, 0 resets zoom",
    ],
  },
  {
    icon: Layers,
    title: "Folder & File Nodes",
    description:
      "Folder cards (orange) show their children inline — scroll inside the card to see more. File cards (purple) show the filename, extension, and size. Right-click any node for a context menu with actions.",
    tips: [
      "Right-click a folder: Rename, Copy Path, Copy Data, Export Subtree, Refresh, Hide",
      "Right-click a file: Rename, Open File, Copy Name, Copy, Cut, Delete",
      "Scroll inside folder cards without zooming the canvas",
    ],
  },
  {
    icon: GripVertical,
    title: "Resize & Drag-Drop",
    description:
      "Select a node to see cyan resize handles. Folders can be resized in all directions. Files can only be resized horizontally. Drag the grip icon on folder entries to drop them onto the canvas — the folder and its contents are loaded from disk.",
    tips: [
      "Drag the grip icon (⋮) next to folder entries to create linked child nodes",
      "Node width/height sliders in the Layout section change all nodes at once",
    ],
  },
  {
    icon: Search,
    title: "Search & Zoom to Nodes",
    description:
      "Press Ctrl+F (or click Search) to open the search panel. Type to fuzzy-search all files and folders. Click any result to instantly zoom to that node on the canvas.",
    tips: [
      "Search matches filenames, paths, and extensions",
      "Hidden nodes appear in search results with a badge — click to unhide & zoom",
      "The breadcrumb bar (top-left) shows the selected node's path",
    ],
  },
  {
    icon: Keyboard,
    title: "Keyboard Shortcuts",
    description:
      "Graphir is designed for keyboard-first power users. Here are the essential shortcuts:",
    tips: [
      "H — hide selected nodes · Shift+H — unhide all",
      "F2 — rename · Enter — open file · Delete — remove",
      "Ctrl+C/X/V — copy/cut/paste · Ctrl+Z — undo · Ctrl+Shift+Z — redo",
      "Ctrl+A — select all · Ctrl+L — cycle layout direction",
    ],
  },
  {
    icon: SlidersHorizontal,
    title: "Layout & Appearance",
    description:
      "Switch between Top→Bottom, Left→Right, Bottom→Top, and Right→Left layouts. Choose curved, angled, or straight edges. Customize the theme with Light, Dark, or Custom mode — the Custom theme editor lets you control folder and file colors independently.",
    tips: [
      "Click 'Beautify Layout' to auto-arrange nodes with proper spacing",
      "Custom theme has 15 color pickers including separate folder/file colors",
    ],
  },
  {
    icon: Download,
    title: "Export & Share",
    description:
      "Click Export to save your graph in 7 formats: SVG, PNG, JSON, CSV, DOT, Directory Script (.sh/.bat), and Directory Tree (.txt). Toggle 'Export selected only' to export just a subtree.",
    tips: [
      "JSON exports can be re-imported via 'Import from File'",
      "Directory Script generates mkdir commands to recreate the folder structure",
      "Directory Tree generates a Unicode ASCII tree for documentation",
    ],
  },
  {
    icon: Bug,
    title: "Report Bugs & Get Help",
    description:
      "Found an issue? Click the bug icon in the toolbar to open the Bug Report dialog. It collects app diagnostics automatically and lets you copy or download a structured JSON report.",
    tips: ["The report includes graph state, browser info, and environment details", "You're all set — happy exploring!"],
  },
];

const STORAGE_KEY = "graphir-tutorial-completed";

export function TutorialDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Check if tutorial should show on first visit
  useEffect(() => {
    try {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        // Small delay so the welcome dialog closes first
        const t = setTimeout(() => setOpen(true), 1500);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          {/* Progress dots */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step
                      ? "w-6 bg-orange-500"
                      : i < step
                        ? "w-1.5 bg-orange-400/50"
                        : "w-1.5 bg-muted-foreground/30"
                  )}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {step + 1} / {STEPS.length}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 border border-border/40">
              <Icon className="h-6 w-6 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{current.title}</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-relaxed">
                {current.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tips */}
        {current.tips && current.tips.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border/40 bg-muted/30 p-3">
            {current.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 text-orange-400">›</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="gap-1 text-muted-foreground"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip tutorial
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleNext}
            className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
          >
            {isLast ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Got it!
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
