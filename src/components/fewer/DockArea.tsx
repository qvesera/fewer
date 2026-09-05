"use client";

import { useRef, useCallback } from "react";
import { useGraphStore } from "@/store/graphStore";
import { cn } from "@/lib/utils";
import {
  clampWidth,
  type PanelArea,
} from "@/lib/fewer/panelLayout";

import { DockAreaHeader } from "./DockAreaHeader";
import { DockAreaContent } from "./DockAreaContent";

interface DockAreaProps {
  area: PanelArea;
  side: "left" | "right";
}

export function DockArea({ area, side }: DockAreaProps) {
  const setAreaWidth = useGraphStore((s) => s.setAreaWidth);

  const resizingRef = useRef(false);
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const rawW = side === "left"
          ? window.innerWidth - ev.clientX
          : ev.clientX;
        setAreaWidth(area.id, clampWidth(rawW));
      };
      const onUp = () => {
        resizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [area.id, side, setAreaWidth],
  );

  return (
    <div
      className="relative hidden sm:flex shrink-0 min-h-0 overflow-hidden border-border/30 bg-card/10"
      style={{
        width: area.width,
        borderLeft: side === "right" ? "1px solid var(--border)" : undefined,
        borderRight: side === "left" ? "1px solid var(--border)" : undefined,
      }}
    >
      <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
        <DockAreaHeader area={area} />
        <DockAreaContent area={area} />
      </div>

      {/* Resize handle (canvas-facing edge) */}
      <div
        onMouseDown={startResize}
        className={cn(
          "absolute top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-border/80 transition-colors",
          side === "left" ? "right-0" : "left-0",
        )}
        title="Drag to resize"
        aria-label="Resize area"
      />
    </div>
  );
}