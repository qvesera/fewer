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
  Minus,
} from "lucide-react";
import { MinimizedDialogPill, useDialogDrag } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graphStore";
import { DEMO_KEYFRAMES } from "@/lib/fewer/tutorial";
import { getBeginnerChecklist } from "@/lib/fewer/tutorial";
import { useDevice } from "@/hooks/use-device";
import { Logo } from "./Logo";

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
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-purple-400/40 bg-purple-500/10 text-primary",
            )}
            style={{
              animationDelay: n.delay,
              transform: `translateX(${n.x}px)`,
            }}
          >
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                n.type === "folder" ? "bg-orange-400" : "bg-primary",
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
  darkCard,
  onToggle,
}: {
  item: import("@/lib/fewer/tutorial").TutorialChecklistItem;
  done: boolean;
  /** Overlay renders a dark inverted card (light page background). */
  darkCard: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        done
          ? "border-green-400/30 bg-green-500/10"
          : darkCard
            ? "border-white/10 bg-white/5 hover:bg-white/10"
            : "border-zinc-950/10 bg-zinc-950/5 hover:bg-zinc-950/10",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
          done
            ? "border-green-400/30 bg-green-500/10"
            : darkCard
              ? "border-white/10 bg-white/5"
              : "border-zinc-950/10 bg-zinc-950/5",
        )}
      >
        {done ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Icon className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-xs font-medium",
            done && "line-through",
            done && (darkCard ? "text-green-300" : "text-green-600"),
          )}
        >
          {item.label}
        </div>
        <div
          className={cn(
            "text-[10px] mt-0.5",
            darkCard ? "text-zinc-100/60" : "text-zinc-900/60",
          )}
        >
          {item.description}
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Portal wrapper: renders children to document.body                        */
/* -------------------------------------------------------------------------- */

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* -------------------------------------------------------------------------- */
/*  Surface polarity: is the page background dark?                            */
/* -------------------------------------------------------------------------- */

/** The inverted overlay can't rely on the `dark` class — custom themes strip
 *  both `light` and `dark` from <html> (see themeSlice.setThemeMode), so a
 *  custom dark theme looks "light" to Tailwind. Read the actual source of
 *  truth: themeMode, plus the custom background's luminance when custom.
 *  ponytail: ignores background opacity — a translucent dark bg still reads
 *  dark; if that ever breaks, compute against the composited canvas color. */
function useDarkBackground() {
  const themeMode = useGraphStore((s) => s.themeMode);
  const customTheme = useGraphStore((s) => s.customTheme);
  if (themeMode === "dark") return true;
  if (themeMode === "light") return false;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(customTheme.background.color);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return lum <= 128;
}

/* -------------------------------------------------------------------------- */
/*  Main Tutorial Dialog                                                      */
/* -------------------------------------------------------------------------- */

export function TutorialDialog({ restartKey = 0 }: { restartKey?: number }) {
  const store = useGraphStore();
  const [open, setOpen] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [mobileStep, setMobileStep] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const { ref, offset, onDragStart } = useDialogDrag();

  const {
    tutorialBeginnerDone,
    tutorialDismissed,
    tutorialDemoStep,
    setTutorialDemoStep,
    resetTutorial,
  } = store;

  const { isTouch } = useDevice();
  const beginnerItems = getBeginnerChecklist(isTouch);
  // Invert against the real page background: dark card on light pages,
  // light card on dark pages — including custom themes, which carry no
  // Tailwind `dark`/`light` class on <html>. (Hook must run before the
  // early returns below.)
  const darkCard = !useDarkBackground();

  // Restart when restartKey changes
  useEffect(() => {
    if (restartKey > 0) {
      resetTutorial();
      setOpen(true);
      setShowWelcome(true);
      setMobileStep(0);
      demoPlayedRef.current = false;
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

  const handleMarkDone = (id: string) => {
    if (tutorialBeginnerDone.includes(id)) {
      store.unmarkTutorialBeginnerStep(id);
    } else {
      store.markTutorialBeginnerStep(id);
    }
  };

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
  <div className="w-full max-w-[380px] overflow-hidden rounded-3xl border border-primary/40 bg-card/90 p-6 shadow-2xl shadow-primary/25 backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 duration-200">
    
    {/* Header & Logo */}
    <div className="flex items-center gap-3.5 mb-4">
      <Logo size={44} showText className="[&>img]:shadow-lg [&>img]:shadow-orange-500/20" />
    </div>

    {/* Body Text */}
    <p className="text-sm leading-relaxed text-foreground mb-6">
      Transform complex file systems into clear, interactive graphs. Explore, search, customize, and export with ease. No data is ever uploaded, you are always in control!
    </p>

    {/* Actions */}
    <div className="space-y-2.5">
      <Button
        type="button"
        onClick={handleStart}
        size="sm"
        className="w-full h-10 rounded-xl gap-2 bg-gradient-to-r from-primary to-primary font-medium text-primary-foreground shadow-md shadow-orange-500/15 hover:opacity-90 active:scale-[0.96] transition-[colors,transform]"
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

  /* ── Minimized ── */
  if (minimized) {
    return (
      <Portal>
        <MinimizedDialogPill
          icon={<BookOpen className="h-3.5 w-3.5 text-primary" />}
          label="Tutorial"
          onRestore={() => setMinimized(false)}
        />
      </Portal>
    );
  }

  /* ── Checklist overlay ── */
  const items = beginnerItems;
  const doneList = tutorialBeginnerDone;

  return (
    <Portal>
      <style suppressHydrationWarning>{DEMO_KEYFRAMES}</style>

      <div
        className={cn(
          "fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] sm:w-[400px] rounded-2xl border border-primary/50 p-4 shadow-2xl shadow-primary/25 backdrop-blur-xl animate-[tutorial-pop-in_0.45s_cubic-bezier(0.16,1,0.3,1),tutorial-attention_1.2s_ease-in-out_0.6s_2]",
          darkCard ? "bg-zinc-950/95 text-zinc-100" : "bg-white/95 text-zinc-900",
        )}
        style={{
          zIndex: 2147483647,
          pointerEvents: "auto",
          transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
        }}
        ref={ref}
      >
        <div className="flex items-center justify-between mb-3">
          <div
            className="flex items-center gap-2 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={onDragStart}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-bold">Tutorial</span>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded p-1 text-current opacity-40 transition-opacity hover:opacity-100"
            title="Minimize"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded p-1 text-current opacity-40 transition-opacity hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-current/20 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 bg-gradient-to-r from-primary to-primary"
              style={{ width: `${((mobileStep + 1) / items.length) * 100}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums opacity-60">
            {`${mobileStep + 1}/${items.length}`}
          </span>
        </div>

        {/* Step-through wizard (used for all screens) */}
        <div className="space-y-3">
            <ChecklistItem
              item={items[mobileStep]}
              done={doneList.includes(items[mobileStep].id)}
              darkCard={darkCard}
              onToggle={() => handleMarkDone(items[mobileStep].id)}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-[10px] !border-current/20 !bg-transparent !text-current hover:!bg-current/10 hover:!text-current"
                disabled={mobileStep === 0}
                onClick={() => setMobileStep((s) => Math.max(0, s - 1))}
              >
                ← Back
              </Button>
              {mobileStep < items.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 text-[10px] bg-gradient-to-r from-primary to-primary text-primary-foreground"
                  onClick={() => setMobileStep((s) => Math.min(items.length - 1, s + 1))}
                >
                  Next →
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 text-[10px] bg-gradient-to-r from-primary to-primary text-primary-foreground"
                    onClick={handleDismiss}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Done
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 text-[10px] !border-current/20 !bg-transparent !text-current hover:!bg-current/10 hover:!text-current"
                    onClick={() => { handleDismiss(); window.location.href = "/docs"; }}
                  >
                    Docs →
                  </Button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full text-center text-[9px] text-current opacity-50 transition-opacity hover:opacity-100"
            >
              Skip tutorial
            </button>
          </div>
        </div>
    </Portal>
  );
}