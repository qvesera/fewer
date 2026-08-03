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
  activeTextClass?: string;
  activeIndicatorClass?: string;
  className?: string;
}

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

  // Gap is gap-1 (4px)
  const gapPx = 4;

  return (
    <div
      className={cn(
        "relative grid w-full min-w-0 gap-1 rounded-lg border border-border/30 p-0.5 bg-muted/10 overflow-hidden",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {/* Smooth, snappy animated pill */}
      <div
        className={cn(
          "absolute top-0.5 bottom-0.5 left-0.5 rounded-md transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] pointer-events-none",
          activeIndicatorClass,
        )}
        style={{
          // Width takes exactly 1 column slot minus space reserved for all gaps
          width: `calc((100% - 0.25rem - ${(n - 1) * gapPx}px) / ${n})`,
          // Smooth fluid slide using transform
          transform: `translateX(calc(${activeIndex} * (100% + ${gapPx}px)))`,
        }}
      />

      {/* Toggle Buttons */}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "relative z-10 min-w-0 truncate rounded-md px-1 py-1.5 text-xs font-medium transition-colors text-center cursor-pointer select-none",
              active
                ? activeTextClass
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="truncate block">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}