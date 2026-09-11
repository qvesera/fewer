"use client";

import { ArrowDownToLine, ArrowRightFromLine, ArrowUpFromLine, ArrowLeftToLine } from "lucide-react";
import type { LayoutDirection } from "@/lib/fewer/types";
import { AnimatedConditional } from "./CollapsibleSection";
import { cn } from "@/lib/utils";

const PRIMARY_LAYOUTS: {
  value: LayoutDirection;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "TB", label: "Vertical", sublabel: "Top → Down", icon: ArrowDownToLine },
  { value: "LR", label: "Horizontal", sublabel: "Left → Right", icon: ArrowRightFromLine },
];

const ADVANCED_LAYOUTS: {
  value: LayoutDirection;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "BT", label: "Upward", sublabel: "Bottom → Top", icon: ArrowUpFromLine },
  { value: "RL", label: "Reverse", sublabel: "Right → Left", icon: ArrowLeftToLine },
];

interface LayoutPickerProps {
  direction: LayoutDirection;
  onPick: (d: LayoutDirection) => void;
  advancedModeEnabled?: boolean;
}

/**
 * Orientation choice cards for the Sidebar's Layout section. Primary layouts are
 * always visible; the two advanced orientations slide in only when advanced mode
 * is enabled.
 */
export function LayoutPicker({ direction, onPick, advancedModeEnabled = false }: LayoutPickerProps) {
  const renderCards = (layouts: typeof PRIMARY_LAYOUTS, iconSize: string) =>
    layouts.map((l) => {
      const Icon = l.icon;
      const active = direction === l.value;
      return (
        <button
          key={l.value}
          type="button"
          onClick={() => onPick(l.value)}
          className={cn(
            "flex flex-col items-center justify-center p-2 rounded-xl border transition-all active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0 overflow-hidden",
            active
              ? "border-primary bg-primary/10 text-primary font-medium shadow-sm"
              : "border-border/50 hover:border-border hover:bg-muted/30 text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className={cn("mb-1 shrink-0", iconSize)} />
          <span className="text-xs truncate w-full text-center font-medium">{l.label}</span>
          <span className="text-[10px] text-muted-foreground/70 font-normal truncate w-full text-center">{l.sublabel}</span>
        </button>
      );
    });

  return (
    <>
      <div className="grid grid-cols-2 gap-2 w-full min-w-0">
        {renderCards(PRIMARY_LAYOUTS, "h-4")}
      </div>

      <AnimatedConditional show={advancedModeEnabled} delay={50}>
        <div className="grid grid-cols-2 gap-2 w-full min-w-0">
          {renderCards(ADVANCED_LAYOUTS, "h-3.5")}
        </div>
      </AnimatedConditional>
    </>
  );
}
