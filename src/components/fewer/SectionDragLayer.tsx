"use client";

import { useRef, useState, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { sectionMetaById, NON_DOCKABLE_SECTIONS } from "./sectionRegistry";
import type { AreaEditor } from "@/lib/fewer/panelLayout";
import { dropSideForX } from "@/lib/fewer/panelTree";
import { can } from "@/lib/fewer/tiers";
import { moveSection, type SectionRect } from "@/lib/fewer/sidebarOrder";
import { useReorderAnimation } from "@/hooks/use-reorder-animation";

interface DragState {
  editor: AreaEditor;
  x0: number;
  y0: number;
  x: number;
  y: number;
  armed: boolean;
  mode: "reorder" | "dock" | null;
  originalOrder: import("@/lib/fewer/sidebarOrder").AreaEditor[];
}

const ARM_THRESHOLD = 8;

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
  });
}

/** Collect rects of all [data-section-id] elements (for insertion index). */
function collectSectionRects(): SectionRect[] {
  const els = document.querySelectorAll("[data-section-id]");
  const rects: SectionRect[] = [];
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) rects.push({ id: el.getAttribute("data-section-id")!, top: r.top, bottom: r.bottom });
  });
  return rects;
}

/** Hit-test against the sidebar sections container — not individual sections.
 *  This avoids flicker when the pointer crosses the gap between sections. */
function isOverSidebarSections(x: number, y: number): boolean {
  const el = document.elementsFromPoint(x, y);
  return el.some((e) => (e as HTMLElement).closest?.("[data-sidebar-sections]"));
}

/** Get the workspace rect; returns null if degenerate (zero-width). */
function getWorkspaceRect(): DOMRect | null {
  const el = document.querySelector("[data-panel-workspace]");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 ? r : null;
}

/** Set data-reordering on the dragged section wrapper; clears on null. */
function setReorderingAttr(id: string | null) {
  document.querySelectorAll("[data-section-id][data-reordering]").forEach((el) => {
    delete (el as HTMLElement).dataset.reordering;
  });
  if (id) {
    const el = document.querySelector(`[data-section-id="${id}"]`) as HTMLElement | null;
    if (el) el.dataset.reordering = "true";
  }
}

export function SectionDragLayer() {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const setSidebarOrder = useGraphStore((s) => s.setSidebarOrder);
  const insertAreaAtEdge = useGraphStore((s) => s.insertAreaAtEdge);
  const tier = useGraphStore((s) => s.tier);
  const dockEnabled = can("panelWorkspace", tier);
  const animateReorder = useReorderAnimation();

  useEffect(() => {
    _setDragState = (s) => { dragRef.current = s; setDrag(s); };
    return () => { _setDragState = null; };
  }, []);

  useEffect(() => {
    if (!drag) return;
    const cleanup = () => { document.body.style.cursor = ""; setReorderingAttr(null); };

    const onMove = (e: PointerEvent) => {
      const prev = dragRef.current;
      if (!prev) return;

      const dx = e.clientX - prev.x0;
      const dy = e.clientY - prev.y0;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!prev.armed) {
        if (dist < ARM_THRESHOLD) return;
        const overSections = isOverSidebarSections(e.clientX, e.clientY);
        const next: DragState = {
          ...prev, armed: true,
          x: e.clientX, y: e.clientY,
          mode: overSections ? "reorder" : "dock",
        };
        dragRef.current = next;
        setDrag(next);
        document.body.style.cursor = "grabbing";
        if (overSections) setReorderingAttr(next.editor);
        return;
      }

      // Armed — scope: sidebar container → reorder, otherwise dock
      const overSections = isOverSidebarSections(e.clientX, e.clientY);
      const newMode: DragState["mode"] = overSections ? "reorder" : "dock";
      const next: DragState = { ...prev, x: e.clientX, y: e.clientY, mode: newMode };

      if (newMode === "reorder") {
        const rects = collectSectionRects();
        const filtered = rects.filter((r) => r.id !== prev.editor);
        const insertIdx = (() => {
          for (let i = 0; i < filtered.length; i++) {
            if (e.clientY < (filtered[i].top + filtered[i].bottom) / 2) return i;
          }
          return filtered.length;
        })();
        const currentOrder = useGraphStore.getState().sidebarOrder;
        const newOrder = moveSection(currentOrder, prev.editor, insertIdx);
        if (newOrder !== currentOrder) {
          animateReorder(() => setSidebarOrder(newOrder));
        }
        setReorderingAttr(next.editor);
      } else if (newMode === "dock") {
        setReorderingAttr(null);
      }

      dragRef.current = next;
      setDrag(next);
    };

    const onUp = () => {
      const cur = dragRef.current;
      if (cur?.armed && cur.mode === "dock" && dockEnabled) {
        const rect = getWorkspaceRect();
        if (rect) {
          animateReorder(() => insertAreaAtEdge(dropSideForX(cur.x, rect), cur.editor));
        }
      }
      dragRef.current = null;
      setDrag(null);
      cleanup();
    };

    const onCancel = () => {
      const cur = dragRef.current;
      if (cur) {
        setReorderingAttr(null);
        animateReorder(() => setSidebarOrder(cur.originalOrder));
      }
      dragRef.current = null;
      setDrag(null);
      cleanup();
    };

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };

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
  }, [drag, setSidebarOrder, insertAreaAtEdge, dockEnabled, animateReorder]);

  if (!drag) return null;

  const meta = sectionMetaById(drag.editor);
  const Icon = meta?.icon;
  // Dock band: only when Pro and mode is dock
  const isDock = drag.mode === "dock" && drag.armed && dockEnabled;

  const ws = isDock ? getWorkspaceRect() : null;
  const side = ws ? dropSideForX(drag.x, ws) : null;
  const dockBand = side && ws ? (
    side === "left"
      ? { left: ws.left, width: ws.width * 0.25 }
      : { left: ws.left + ws.width * 0.75, width: ws.width * 0.25 }
  ) : null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" style={{ cursor: drag.armed ? "grabbing" : "default" }}>
      {/* Ghost card */}
      <div
        className="absolute pointer-events-none rounded-xl border border-primary/40 bg-background/90 backdrop-blur-md shadow-xl px-3 py-2 flex items-center gap-2"
        style={{ left: drag.x + 12, top: drag.y - 16, transform: "translateZ(0)" }}
      >
        {Icon && <Icon className="h-4 w-4 text-primary/80 shrink-0" />}
        <span className="text-xs font-medium text-foreground whitespace-nowrap">
          {meta?.title ?? drag.editor}
        </span>
      </div>

      {/* Dock preview band — Pro only */}
      {dockBand && (
        <div
          className="absolute top-0 bottom-0 bg-primary/15 border-x-2 border-primary/40 transition-all duration-150 flex items-center justify-center"
          style={{ left: dockBand.left, width: dockBand.width }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary select-none">
            Dock {side === "left" ? "Left" : "Right"}
          </span>
        </div>
      )}
    </div>
  );
}
