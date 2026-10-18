"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * An info icon that explains the row it sits on when hovered or focused from
 * the keyboard (T-172) - the affordance the export format cards already use
 * (ExportPanel), generalised so the sidebar and the settings dialog can put
 * their prose behind it instead of under every control.
 *
 * The sentence is the tooltip's children, and when the caller gives an `id`
 * the same sentence is kept in the DOM as sr-only text for aria-describedby,
 * so de-cluttering a panel never de-clutters it away from a screen reader. A
 * real button, not the span the export cards wrap: that one already lives
 * inside a <button>, while this has to take a Tab and a tap on its own.
 *
 * `side` defaults to right (the sidebar sits on the left edge); settings rows
 * pass "left" because their icons sit on the right edge of the dialog.
 */
export function InfoTip({
  label,
  id,
  side = "right",
  className,
  children,
}: {
  label: string;
  id?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  children: ReactNode;
}) {
  return (
    // Its own provider: the tip has to render wherever a panel renders - the
    // app mounts one at AppShell for everything else, but a component test
    // (and any future standalone use) should not have to know that.
    <TooltipProvider delayDuration={0}>
      <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          aria-describedby={id}
          className={cn(
            "min-hit inline-flex shrink-0 cursor-help items-center justify-center rounded-full p-1 text-muted-foreground/50 transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[260px] text-xs leading-normal">
        {children}
      </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
