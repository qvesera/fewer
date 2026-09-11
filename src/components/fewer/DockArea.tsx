"use client";

import { type PanelArea } from "@/lib/fewer/panelLayout";
import { DockAreaContent } from "./DockAreaContent";

interface DockAreaProps {
  area: PanelArea;
}

/** Section-editor leaf content (no header — LeafNode provides the unified header). */
export function DockArea({ area }: DockAreaProps) {
  return (
    <div className="relative hidden sm:flex flex-col shrink-0 min-h-0 min-w-0 overflow-hidden flex-1">
      <DockAreaContent area={area} />
    </div>
  );
}