"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { sectionMetaById, NON_DOCKABLE_SECTIONS } from "./sectionRegistry";
import { cn } from "@/lib/utils";
import type { AreaEditor } from "@/lib/fewer/panelLayout";

interface DragState {
  editor: AreaEditor;
  x: number;
  y: number;
}

let _setDragState: ((s: DragState | null) => void) | null = null;

/** Called by sidebar section headers to initiate a drag. */
export function startSectionDrag(editor: AreaEditor, e: React.PointerEvent) {
  if (NON_DOCKABLE_SECTIONS.has(editor)) return;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  _setDragState?.({ editor, x: e.clientX, y: e.clientY });
}

/** Edge strip component — shown during drag, handles drop to create area. */
export function SectionDragLayer() {
  const [drag, setDrag] = useState<DragState | null>(null);
  const insertAreaAtEdge = useGraphStore((s) => s.insertAreaAtEdge);
  const dropSideForPointerX = useCallback((x: number) => {
    return x < window.innerWidth / 2 ? "left" as const : "right" as const;
  }, []);

  // Register the global setter so sidebar sections can start drags
  useEffect(() => {
    _setDragState = setDrag;
    return () => { _setDragState = null; };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    setDrag((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  }, [drag]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    const side = dropSideForPointerX(e.clientX);
    insertAreaAtEdge(side, drag.editor);
    setDrag(null);
  }, [drag, insertAreaAtEdge, dropSideForPointerX]);

  if (!drag) return null;

  const meta = sectionMetaById(drag.editor);
  const isLeft = drag.x < window.innerWidth / 2;
  const Icon = meta?.icon;

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-auto"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: "grabbing" }}
    >
      {/* Ghost card following cursor */}
      <div
        className="absolute pointer-events-none rounded-xl border border-primary/40 bg-background/90 backdrop-blur-md shadow-xl px-3 py-2 flex items-center gap-2"
        style={{ left: drag.x + 12, top: drag.y - 16, transform: "translateZ(0)" }}
      >
        {Icon && <Icon className="h-4 w-4 text-primary/80 shrink-0" />}
        <span className="text-xs font-medium text-foreground whitespace-nowrap">
          {meta?.title ?? drag.editor}
        </span>
      </div>

      {/* Left edge strip */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-8 transition-colors duration-150",
          isLeft ? "bg-primary/20" : "bg-transparent",
        )}
      />

      {/* Right edge strip */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-8 transition-colors duration-150",
          !isLeft ? "bg-primary/20" : "bg-transparent",
        )}
      />

      {/* Dock hint labels */}
      <div
        className={cn(
          "absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider transition-opacity",
          isLeft ? "opacity-100 text-primary" : "opacity-30 text-muted-foreground",
        )}
      >
        Dock Left
      </div>
      <div
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wider transition-opacity",
          !isLeft ? "opacity-100 text-primary" : "opacity-30 text-muted-foreground",
        )}
      >
        Dock Right
      </div>
    </div>
  );
}