"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";
import { cn } from "@/lib/utils";
import { splitLeaf, joinLeaf } from "@/lib/fewer/panelTree";

/** Find which leaf element is at viewport coords (other than source). */
function findNeighborLeafId(x: number, y: number, excludeId: string): string | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const w = (el as HTMLElement).closest?.("[data-leaf-id]") as HTMLElement | null;
    if (w) { const id = w.getAttribute("data-leaf-id"); if (id && id !== excludeId) return id; }
  }
  return null;
}

/** Where the new sibling lands per axis, for each of the four corners. */
interface CornerSide { h: "start" | "end"; v: "start" | "end" }
interface CornerConfig extends CornerSide {
  key: string;
  position: string;
  cursor: string;
}

const CORNERS: CornerConfig[] = [
  { key: "tl", h: "start", v: "start", position: "top-[34px] left-1", cursor: "cursor-nwse-resize" },
  { key: "tr", h: "end",   v: "start", position: "top-[34px] right-1", cursor: "cursor-nesw-resize" },
  { key: "bl", h: "start", v: "end",   position: "bottom-1 left-1", cursor: "cursor-nesw-resize" },
  { key: "br", h: "end",   v: "end",   position: "bottom-1 right-1", cursor: "cursor-nwse-resize" },
];

interface GestureState {
  leafId: string;
  cornerKey: string;
  corner: CornerSide;
  mode: "split" | "join" | null;
  dir: "h" | "v";
  side: "start" | "end";
  joinTargetId: string | null;
  previewRatio: number;
  leafRect: DOMRect | null;
}

export function CornerGrip({ leafId, containerRef }: { leafId: string; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [gesture, setGesture] = useState<GestureState | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const makeOnPointerDown = useCallback((corner: CornerConfig) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startPos.current = { x: e.clientX, y: e.clientY };
    gestureRef.current = {
      leafId, cornerKey: corner.key, corner,
      mode: null, dir: "h", side: "end", joinTargetId: null,
      previewRatio: 0.5, leafRect: containerRef.current?.getBoundingClientRect() ?? null,
    };
    setGesture(gestureRef.current);
  }, [leafId, containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || !g.leafRect) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lr = g.leafRect;
    const inLR = e.clientX >= lr.left && e.clientX <= lr.right;
    const inTB = e.clientY >= lr.top && e.clientY <= lr.bottom;
    const inside = inLR && inTB;

    if (!g.mode && dist > 5) {
      if (inside) {
        g.dir = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
        g.side = g.dir === "h" ? g.corner.h : g.corner.v;
        g.mode = "split";
      } else {
        g.mode = "join";
        g.joinTargetId = findNeighborLeafId(e.clientX, e.clientY, leafId);
      }
    }
    if (g.mode === "split") {
      g.previewRatio = g.dir === "h"
        ? Math.max(0.15, Math.min(0.85, (e.clientX - lr.left) / lr.width))
        : Math.max(0.15, Math.min(0.85, (e.clientY - lr.top) / lr.height));
      if (!inside) { g.mode = "join"; g.joinTargetId = findNeighborLeafId(e.clientX, e.clientY, leafId); }
    } else if (g.mode === "join") {
      g.joinTargetId = findNeighborLeafId(e.clientX, e.clientY, leafId);
    }
    gestureRef.current = { ...g };
    setGesture({ ...g });
  }, [leafId]);

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (g?.mode === "split") {
      const store = useGraphStore.getState();
      const newTree = splitLeaf(store.panelTree, leafId, g.dir, g.previewRatio, g.side);
      store.setPanelTree(newTree);
    } else if (g?.mode === "join" && g.joinTargetId) {
      const store = useGraphStore.getState();
      const newTree = joinLeaf(store.panelTree, leafId);
      store.setPanelTree(newTree);
    }
    gestureRef.current = null; setGesture(null);
  }, [leafId]);

  return (
    <>
      {CORNERS.map((corner) => (
        <div
          key={corner.key}
          onPointerDown={makeOnPointerDown(corner)}
          onPointerMove={gesture?.cornerKey === corner.key ? onPointerMove : undefined}
          onPointerUp={gesture?.cornerKey === corner.key ? onPointerUp : undefined}
          className={cn(
            "absolute z-30 w-3 h-3 rounded-full",
            corner.position,
            corner.cursor,
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "bg-muted-foreground/40 hover:bg-primary/60",
            gesture?.cornerKey === corner.key && "opacity-100 bg-primary/80",
          )}
          title="Drag to split or merge"
        />
      ))}
      {gesture?.mode === "split" && gesture.leafRect && (
        <div className="absolute z-30 pointer-events-none" style={
          gesture.dir === "h"
            ? { left: `${gesture.previewRatio * 100}%`, top: 0, bottom: 0, width: 2, background: "var(--primary)", opacity: 0.7 }
            : { top: `${gesture.previewRatio * 100}%`, left: 0, right: 0, height: 2, background: "var(--primary)", opacity: 0.7 }
        } />
      )}
      {gesture?.mode === "join" && gesture.joinTargetId && <JoinPreview targetId={gesture.joinTargetId} />}
    </>
  );
}

function JoinPreview({ targetId }: { targetId: string }) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    const el = document.querySelector(`[data-leaf-id="${targetId}"]`) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setStyle({ position: "fixed", left: r.left, top: r.top, width: r.width, height: r.height, background: "var(--primary)", opacity: 0.15, pointerEvents: "none", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" });
  }, [targetId]);
  return <div style={style}><span className="text-4xl text-primary font-bold select-none">\u2715</span></div>;
}
