import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Sync the container's rendered width/height into the store so the minimap
 * X/Y sliders in Settings scale to the actual canvas (no hard cap).
 */
export function useCanvasResize(
  containerRef: RefObject<HTMLDivElement | null>,
  setCanvasSize: (size: { width: number; height: number }) => void,
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, setCanvasSize]);
}
