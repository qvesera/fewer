"use client";

import { useRef, useState, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { sectionMetaById, NON_DOCKABLE_SECTIONS } from "./sectionRegistry";
import type { AreaEditor } from "@/lib/fewer/panelLayout";
import { dropSideForX } from "@/lib/fewer/panelTree";
import { can } from "@/lib/fewer/tiers";
import { moveSection, type SectionRect } from "@/lib/fewer/sidebarOrder";

interface DragState {
  editor: AreaEditor;
  x0: number;
  y0: number;
  x: number;
  y: number;
  armed: boolean;
  /** "reorder" when pointer is over a section, "dock" when outside (Pro-only). */
  mode: "reorder" | "dock" | null;
  originalOrder: import("@/lib/fewer/sidebarOrder").AreaEditor[];
  dropIndex: number;
}

const ARM_THRESHOLD = 5;

let _setDragState: ((s: DragState | null) => void) | null = null;

/** Called by sidebar section grip buttons to initiate a drag. */
export function startSectionDrag(editor: AreaEditor, e: React.PointerEvent) {
  if (NON_DOCKABLE_SECTIONS.has(editor)) return;
  _setDragState?.({
    editor,
    x0: e.clientX,
    y0: e.clientY,
    x: e.clientX,
    y: e.clientY,
    armed: false,
    mode: null,
    originalOrder: useGraphStore.getState().sidebarOrder,
    dropIndex: -1,
  });
}

/** Collect rects of all [data-section-id] elements in the sidebar. */
function collectSectionRects(): SectionRect[] {
  const els = document.querySelectorAll("[data-section-id]");
  const rects: SectionRect[] = [];
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) rects.push({ id: el.getAttribute("data-section-id")!, top: r.top, bottom: r.bottom });
  });
  return rects;
}

/** Check if a point is over any [data-section-id] element. */
function isOverSection(x: number, y: number): boolean {
  const els = document.elementsFromPoint(x, y);
  return els.some((el) => (el as HTMLElement).closest?.("[data-section-id]"));
}

/**
 * Unified drag layer — one gesture, two scopes:
 * - pointer inside sidebar sections → reorder (live reorder, commit on drop)
 * - pointer outside sidebar → dock (Pro-gated band preview, insertAreaAtEdge on drop)
 *
 * Window listeners (no pointer capture mismatch). Overlay is pointer-events-none.
 */
export function SectionDragLayer() {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setSidebarOrder = useGraphStore((s) => s.setSidebarOrder);
  const insertAreaAtEdge = useGraphStore((s) => s.insertAreaAtEdge);

  // Register the global setter so sidebar grips can start drags
  useEffect(() => {
    _setDragState = (s) => { dragRef.current = s; setDrag(s); };
    return () => { _setDragState = null; };
  }, []);

  // Window listeners while dragging
  useEffect(() => {
    if (!drag) return;

    const cleanup = () => { document.body.style.cursor = ""; };

    const onMove = (e: PointerEvent) => {
      const prev = dragRef.current;
      if (!prev) return;

      const dx = e.clientX - prev.x0;
      const dy = e.clientY - prev.y0;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!prev.armed) {
        if (dist < ARM_THRESHOLD) return;
        // Arm — determine initial mode from pointer position
        const overSection = isOverSection(e.clientX, e.clientY);
        const next: DragState = {
          ...prev,
          armed: true,
          x: e.clientX,
          y: e.clientY,
          mode: overSection ? "reorder" : "dock",
          dropIndex: prev.originalOrder.indexOf(prev.editor),
        };
        dragRef.current = next;
        setDrag(next);
        // ponytail: set cursor on body since overlay is pointer-events-none
        document.body.style.cursor = "grabbing";
        return;
      }

      // Armed — update position and mode
      const overSection = isOverSection(e.clientX, e.clientY);
      const newMode: DragState["mode"] = overSection ? "reorder" : "dock";

      const next: DragState = { ...prev, x: e.clientX, y: e.clientY, mode: newMode };

      if (newMode === "reorder") {
        const rects = collectSectionRects();
        // Filter out the dragged section for insertion index
        const filtered = rects.filter((r) => r.id !== prev.editor);
        const rawIndex = (() => {
          for (let i = 0; i < filtered.length; i++) {
            const mid = (filtered[i].top + filtered[i].bottom) / 2;
            if (e.clientY < mid) return i;
          }
          return filtered.length;
        })();
        // Map to the target id in the current order
        const targetId = filtered[rawIndex]?.id;
        const currentOrder = useGraphStore.getState().sidebarOrder;
        const dropIdx = targetId != null ? currentOrder.indexOf(targetId as AreaEditor) : currentOrder.length;
        next.dropIndex = dropIdx;

        // Live reorder — commit to store so sidebar re-renders
        const newOrder = moveSection(currentOrder, prev.editor, dropIdx);
        if (newOrder !== currentOrder) setSidebarOrder(newOrder);
      }

      dragRef.current = next;
      setDrag(next);
    };

    const onUp = () => {
      const cur = dragRef.current;
      if (cur?.armed && cur.mode === "dock") {
        const tier = useGraphStore.getState().tier;
        if (can("panelWorkspace", tier)) {
          const workspaceEl = document.querySelector("[data-panel-workspace]");
          const rect = workspaceEl?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
          const side = dropSideForX(cur.x, rect);
          insertAreaAtEdge(side, cur.editor);
        }
      }
      // Reorder is already committed live; nothing more to do
      dragRef.current = null;
      setDrag(null);
      cleanup();
    };

    const onCancel = () => {
      // Escape or pointercancel — restore original order
      const cur = dragRef.current;
      if (cur) setSidebarOrder(cur.originalOrder);
      dragRef.current = null;
      setDrag(null);
      cleanup();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      cleanup();
    };
  }, [drag, setSidebarOrder, insertAreaAtEdge]);

  if (!drag) return null;

  const meta = sectionMetaById(drag.editor);
  const Icon = meta?.icon;
  const isDock = drag.mode === "dock" && drag.armed;

  // Compute dock preview band position
  let dockBand: { left: number; width: number } | null = null;
  if (isDock) {
    const workspaceEl = document.querySelector("[data-panel-workspace]");
    const rect = workspaceEl?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth, width: window.innerWidth, top: 0, bottom: window.innerHeight, height: window.innerHeight } as DOMRect;
    const side = dropSideForX(drag.x, rect);
    dockBand = side === "left"
      ? { left: rect.left, width: rect.width * 0.25 }
      : { left: rect.left + rect.width * 0.75, width: rect.width * 0.25 };
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" style={{ cursor: drag.armed ? "grabbing" : "default" }}>
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

      {/* Dock preview band — replaces the old window-edge strips */}
      {dockBand && (
        <div
          className="absolute top-0 bottom-0 bg-primary/15 border-x-2 border-primary/40 transition-all duration-150 flex items-center justify-center"
          style={{ left: dockBand.left, width: dockBand.width }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary select-none">
            Dock {dropSideForX(drag.x, { left: dockBand.left, right: dockBand.left + dockBand.width }) === "left" ? "Left" : "Right"}
          </span>
        </div>
      )}
    </div>
  );
}
