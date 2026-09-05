"use client";

import { type PanelArea } from "@/lib/fewer/panelLayout";
import { DockAreaHeader } from "./DockAreaHeader";
import { DockAreaContent } from "./DockAreaContent";

interface DockAreaProps {
  area: PanelArea;
  side: "left" | "right";
}

/** Section-editor leaf in the split tree.  Sizing is handled by the parent TreeRenderer — DockArea just fills its container. */
export function DockArea({ area }: DockAreaProps) {
  return (
    <div className="relative hidden sm:flex flex-col shrink-0 min-h-0 min-w-0 overflow-hidden border-border/30 bg-card/10 border-l border-r border-border/20">
      <DockAreaHeader area={area} />
      <DockAreaContent area={area} />
    </div>
  );
}