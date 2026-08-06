"use client";

import { cn } from "@/lib/utils";

interface OptionGroupOption<T extends string> {
  value: T;
  label: string;
}

interface OptionGroupProps<T extends string> {
  options: OptionGroupOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Active button classes (border, bg, text). Default: purple */
  activeClass?: string;
  /** Additional classes for the grid container */
  className?: string;
}

/**
 * A grid of selectable option buttons. The active option gets a colored
 * border + background. Grid columns auto-adjust: 2 cols for 2 options,
 * 3 cols for 3+.
 */
export function OptionGroup<T extends string>({
  options,
  value,
  onValueChange,
  activeClass = "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-300",
  className,
}: OptionGroupProps<T>) {
  return (
    <div
      className={cn(
        "grid gap-2",
        options.length === 2 ? "grid-cols-2" : "grid-cols-3",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-xs font-normal text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? activeClass
                : "border-border/60 hover:bg-muted/40 text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}