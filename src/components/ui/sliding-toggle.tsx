"use client";

import { cn } from "@/lib/utils";

interface SlidingToggleOption {
  value: string;
  label: string;
}

interface SlidingToggleProps {
  options: SlidingToggleOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Text color class for active button. Default: purple */
  activeTextClass?: string;
  /** Indicator classes (bg, border, shadow). Default: purple glow */
  activeIndicatorClass?: string;
  /** Additional classes for the container */
  className?: string;
}

/**
 * A multi-option toggle with a sliding indicator that flows between states.
 * The indicator slides to the active position with a 300ms cubic-bezier
 * transition and shows a colored glow. Supports 2+ options.
 */
export function SlidingToggle({
  options,
  value,
  onValueChange,
  activeTextClass = "text-purple-600 dark:text-purple-300",
  activeIndicatorClass = "bg-purple-500/15 border border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.25)]",
  className,
}: SlidingToggleProps) {
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;

  return (
    <div
      className={cn(
        "relative grid gap-1 rounded-lg border border-border/30 p-0.5 bg-muted/10",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      {/* Sliding indicator — flows to active position */}
      <div
        className={cn(
          "absolute top-0.5 bottom-0.5 left-0.5 rounded-md transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          activeIndicatorClass,
        )}
        style={{
          width: `calc((100% - ${(n - 1) * 4}px) / ${n})`,
          transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "relative z-10 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? activeTextClass
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
