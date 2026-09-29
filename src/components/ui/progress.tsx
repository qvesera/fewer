"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // No value = indeterminate (Radix omits aria-valuenow, which is correct ARIA).
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      // Forwarded so Radix owns data-state + aria-value*; the indicator below
      // only mirrors it visually. (It was destructured out and never passed on,
      // which left every bar permanently "indeterminate" to assistive tech.)
      value={value}
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      {value == null ? (
        // Indeterminate: a full-track hatch, NOT a fixed-width segment. A
        // parked 33%-wide block reads as "30% done" the instant the animation
        // stops running (reduced motion, or a stylesheet without the keyframe),
        // which is worse than no bar at all. The hatch says "unknown" with or
        // without motion. See .gm-progress-indeterminate in globals.css.
        <div
          data-slot="progress-indicator"
          className="gm-progress-indeterminate absolute inset-0"
        />
      ) : (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="bg-primary h-full w-full flex-1 transition-all"
          style={{ transform: `translateX(-${100 - value}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  )
}

export { Progress }
