"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Layers,
  MousePointerClick,
  Search,
  Download,
  Check,
  X,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { DEMO_KEYFRAMES } from "@/lib/fewer/tutorial";
import { getBeginnerChecklist } from "@/lib/fewer/tutorial";
import { isFileSystemAccessSupported } from "@/lib/fewer/fileSystem";

/* -------------------------------------------------------------------------- */
/*  Demo stage - animated node preview                                        */
/* -------------------------------------------------------------------------- */

function DemoStage({ step }: { step: number }) {
  const nodes = [
    { label: "src", type: "folder", delay: "0ms", x: 0 },
    { label: "components", type: "folder", delay: "150ms", x: 120 },
    { label: "App.tsx", type: "file", delay: "300ms", x: 240 },
    { label: "index.ts", type: "file", delay: "450ms", x: 240 },
    { label: "styles", type: "folder", delay: "150ms", x: -120 },
    { label: "globals.css", type: "file", delay: "300ms", x: -120 },
  ];

  return (
    <div className="relative h-20 w-full overflow-hidden rounded-lg bg-muted/30 border border-border/40">
      <div className="absolute inset-0 flex items-center justify-center gap-2">
        {nodes.slice(0, step).map((n, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-medium shadow-sm border",
              "animate-[tutorial-bounce-in_0.5s_ease-out_both]",
              n.type === "folder"
                ? "border-orange-400/40 bg-orange-500/10 text-orange-300"
                : "border-purple-400/40 bg-purple-500/10 text-purple-300",
            )}
            style={{
              animationDelay: n.delay,
              transform: `translateX(${n.x}px)`,
            }}
          >
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                n.type === "folder" ? "bg-orange-400" : "bg-purple-400",
              )}
            />
            {n.label}
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent bg-[length:200%_100%] animate-[tutorial-shimmer_3s_ease-in-out_infinite]"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Checklist item                                                            */
/* -------------------------------------------------------------------------- */

function ChecklistItem({
  item,
  done,
  onToggle,
}: {
  item: import("@/lib/fewer/tutorial").TutorialChecklistItem;
  done: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
        done
          ? "border-green-400/30 bg-green-500/5"
          : "border-border/40 bg-card/50",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
          done
            ? "border-green-400/30 bg-green-500/10"
            : "border-border/40 bg-muted/30",
        )}
      >
        {done ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Icon className="h-4 w-4 text-orange-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("text-xs font-medium", done && "text-green-300 line-through")}>
          {item.label}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {item.description}
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Portal wrapper — renders children to document.body                        */
/* -------------------------------------------------------------------------- */

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* -------------------------------------------------------------------------- */
/*  Main Tutorial Dialog                                                      */
/* -------------------------------------------------------------------------- */

export function TutorialDialog({ restartKey = 0 }: { restartKey?: number }) {
  const store = useGraphStore();
  const [open, setOpen] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);

  const {
    tutorialBeginnerDone,
    tutorialDismissed,
    tutorialDemoStep,
    setTutorialDemoStep,
    resetTutorial,
  } = store;

  const beginnerItems = getBeginnerChecklist();

  // Restart when restartKey changes
  useEffect(() => {
    if (restartKey > 0) {
      resetTutorial();
      setOpen(true);
      setShowWelcome(true);
    }
  }, [restartKey, resetTutorial]);

  // Auto-detect beginner steps
  useEffect(() => {
    const unsubscribe = useGraphStore.subscribe((state) => {
      for (const item of beginnerItems) {
        if (state.tutorialBeginnerDone.includes(item.id)) continue;
        if (!item.watchState) continue;
        const { key, value } = item.watchState;
        const stateValue = (state as unknown as Record<string, unknown>)[key];
        if (value === null) {
          if (key === "selectedNodeIds" && Array.isArray(stateValue) && stateValue.length > 0) {
            useGraphStore.getState().markTutorialBeginnerStep(item.id);
          }
        } else if (stateValue === value) {
          useGraphStore.getState().markTutorialBeginnerStep(item.id);
        }
      }
    });
    return () => unsubscribe();
  }, [beginnerItems]);

  // Auto-advance demo step when sample loads (once per mount)
  const demoPlayedRef = useRef(false);
  useEffect(() => {
    if (store.dataSource === "sample" && tutorialDemoStep === 0 && !demoPlayedRef.current) {
      demoPlayedRef.current = true;
      const interval = setInterval(() => {
        const next = useGraphStore.getState().tutorialDemoStep + 1;
        if (next >= 6) { clearInterval(interval); setTutorialDemoStep(6); }
        else setTutorialDemoStep(next);
      }, 200);
      return () => clearInterval(interval);
    }
  }, [store.dataSource, tutorialDemoStep, setTutorialDemoStep]);

  const handleDismiss = () => {
    useGraphStore.getState().setTutorialDismissed();
    setOpen(false);
  };

  const handleStart = () => {
    setShowWelcome(false);
  };

  const handleResetTutorial = () => {
    resetTutorial();
    setOpen(true);
    setShowWelcome(true);
  };

  const handleMarkDone = (id: string) => {
    store.markTutorialBeginnerStep(id);
  };

  const allDone = tutorialBeginnerDone.length >= beginnerItems.length && beginnerItems.length > 0;

  // If dismissed or local closed, show nothing
  if (!open || (useGraphStore.getState().tutorialDismissed && restartKey === 0)) {
    return null;
  }

  /* ── Welcome screen ── */
  if (showWelcome) {
    return (
      <Portal>
        <style suppressHydrationWarning>{DEMO_KEYFRAMES}</style>
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
  <div className="w-full max-w-[380px] overflow-hidden rounded-3xl border border-white/10 bg-card/90 p-6 shadow-2xl backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 duration-200">
    
    {/* Header & Logo */}
    <div className="flex items-center gap-3.5 mb-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 ring-1 ring-white/20">
        <Sparkles className="h-5.5 w-5.5" />
      </div>
      <div className="flex flex-col">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-amber-600 bg-clip-text text-transparent">
            fewer
          </span>
        </h2>
      </div>
    </div>

    {/* Body Text */}
    <p className="text-xs leading-relaxed text-black-foreground mb-6">
      Transform complex file systems into clear, interactive graphs. Explore, search, customize, and export with ease. No data is ever uploaded, you are always in control!
    </p>

    {/* Actions */}
    <div className="space-y-2.5">
      <Button
        type="button"
        onClick={handleStart}
        size="sm"
        className="w-full h-10 rounded-xl gap-2 bg-gradient-to-r from-orange-500 to-amber-500 font-medium text-white shadow-md shadow-orange-500/15 hover:from-orange-600 hover:to-amber-600 active:scale-[0.96] transition-[colors,transform]"
      >
        <BookOpen className="h-4 w-4" />
        Start Tutorial
      </Button>

      <button
        type="button"
        onClick={handleDismiss}
        className="w-full py-1 text-xs text-muted-foreground/70 hover:text-foreground font-medium transition-colors text-center"
      >
        Explore on my own
      </button>
    </div>

  </div>
</div>
      </Portal>
    );
  }

  /* ── Checklist overlay ── */
  const items = beginnerItems;
  const doneList = tutorialBeginnerDone;
  const progress = items.length > 0 ? (doneList.length / items.length) * 100 : 0;

  return (
    <Portal>
      <style suppressHydrationWarning>{DEMO_KEYFRAMES}</style>

      <div
        className="fixed w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/40 bg-card/95 p-4 shadow-2xl backdrop-blur-xl animate-[tutorial-fade-in_0.3s_ease-out] bottom-4 right-4"
        style={{ zIndex: 2147483647, pointerEvents: "auto" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10">
              <BookOpen className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <span className="text-xs font-bold">Tutorial</span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded p-1 text-muted-foreground/50 hover:text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 bg-gradient-to-r from-orange-500 to-amber-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {doneList.length}/{items.length}
          </span>
        </div>

        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {items.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              done={doneList.includes(item.id)}
              onToggle={() => handleMarkDone(item.id)}
            />
          ))}
        </div>

        {allDone && (
          <div className="mt-3 rounded-lg border border-green-400/30 bg-green-500/5 p-3 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-400" />
              <span className="text-xs font-bold text-green-300">All done!</span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1 text-[10px]"
                onClick={handleResetTutorial}
              >
                Restart
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 text-[10px] bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                onClick={handleDismiss}
              >
                <Check className="h-3 w-3 mr-1" />
                Done
              </Button>
            </div>
          </div>
        )}

        {!allDone && (
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-2 w-full text-center text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Skip tutorial
          </button>
        )}
      </div>
    </Portal>
  );
}