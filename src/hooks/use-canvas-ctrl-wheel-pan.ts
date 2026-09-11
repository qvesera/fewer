import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useReactFlow } from "@xyflow/react";

/**
 * When enabled (scrollAction === "zoom"), intercepts Ctrl/⌘+wheel events
 * on the canvas container and pans vertically instead of zooming.
 * Trackpad pinch (which also sends ctrlKey=true without a real keydown)
 * is detected by tracking physical modifier-key state and left alone
 * so native pinch-zoom keeps working.
 */
export function useCanvasCtrlWheelPan(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const { getViewport, setViewport } = useReactFlow();
  const modifierHeld = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") modifierHeld.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") modifierHeld.current = false;
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });

    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel = native zoom
      if (!modifierHeld.current) return; // pinch gesture — let d3 zoom handle it
      e.preventDefault();
      e.stopPropagation();
      const { x, y, zoom } = getViewport();
      setViewport({ x, y: y - e.deltaY, zoom });
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      el.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [enabled, getViewport, setViewport, containerRef]);
}
