"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible sidebar panel shell: ghost-button header (chevron + icon + title + optional badge) over a grid-rows animated body. Shared by Sidebar and any other panel that needs the same disclosure affordance.
 */
export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  forceOpen,
  dragHandleProps,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: string;
  forceOpen?: number;
  /** When provided, renders a grip handle before the chevron for drag-to-dock. */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceOpen !== undefined && forceOpen > 0) {
      setOpen(true);
    }
  }, [forceOpen]);

  return (
    <section 
      ref={sectionRef} 
      className="w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-xl border border-border/30 bg-card/10 transition-colors duration-200 hover:border-border/60 focus-within:border-border/80"
    >
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-3 h-auto text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors rounded-xl outline-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 justify-start"
      >
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing shrink-0 -ml-1 p-0.5 rounded hover:bg-muted/50 touch-none"
            title="Drag to dock"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        )}
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground/70 shrink-0", open && "rotate-90")} />
        <Icon className="h-4 w-4 shrink-0 text-primary/80" />
        <span className="truncate flex-1 text-left">{title}</span>
        {badge && (
          <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {badge}
          </span>
        )}
      </Button>
      <div
        className={cn(
          "grid w-full min-w-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          open 
            ? "grid-rows-[1fr] opacity-100 translate-y-0 pb-3" 
            : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none pb-0"
        )}
      >
        <div className="w-full min-w-0 min-h-0 overflow-hidden px-3">
          <div className="flex flex-col gap-3 pt-1 w-full min-w-0">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * Mount/unmount wrapper for animated show/hide: renders children only while a
 * show/hide transition is in flight, sliding open via grid-template-rows.
 * `delay` staggers the entrance when several sections animate together.
 */
export function AnimatedConditional({
  show,
  delay = 0,
  children,
}: {
  show: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(show);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (show) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setIsAnimatingIn(false);
      timer = setTimeout(() => setShouldRender(false), 250);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!shouldRender) return null;

  const active = show && isAnimatingIn;

  return (
    <div
      // Added `shrink-0` to the animated wrapper
      className={cn(
        "grid w-full min-w-0 shrink-0 transition-[grid-template-rows,opacity,transform] duration-250 ease-in-out",
        active
          ? "grid-rows-[1fr] opacity-100 scale-y-100"
          : "grid-rows-[0fr] opacity-0 scale-y-95 pointer-events-none"
      )}
      style={{ transitionDelay: active ? `${delay}ms` : "0ms" }}
    >
      <div className="w-full min-w-0 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
