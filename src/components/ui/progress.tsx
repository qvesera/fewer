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
  // The sliding segment is a local keyframe so the shared indicator keeps its
  // existing determinate transform.
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
        <div
          data-slot="progress-indicator"
          className="bg-primary absolute inset-y-0 w-1/3 rounded-full motion-safe:animate-[progress-slide_1.4s_ease-in-out_infinite]"
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
