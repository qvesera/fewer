"use client";

import { useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import { computeFlipOffsets, REORDER_EASE, REORDER_DURATION_MS } from "@/lib/fewer/reorderMotion";

/**
 * Imperative FLIP helper for sidebar section reorder.
 * Call `animateReorder(() => storeAction(...))` and the helper:
 *  1. measures [data-section-id] tops (skipping zero-height = hidden mobile copy),
 *  2. runs the mutation synchronously via flushSync,
 *  3. measures again and plays WAAPI animations to smooth the jump.
 *
 * No useLayoutEffect — avoids the SSR warning the repo deliberately avoids.
 * flushSync is React core (no new dep).
 */
export function useReorderAnimation() {
  const animsRef = useRef<Map<string, Animation>>(new Map());
  const prevScrollTopRef = useRef(0);

  return useCallback((mutate: () => void) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Measure "before" tops
    const before = new Map<string, number>();
    document.querySelectorAll("[data-section-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return; // hidden mobile copy
      before.set(el.getAttribute("data-section-id")!, r.top);
    });

    // Scroll guard: if the user scrolled since the last run, refresh cache
    // and skip animating this time to avoid wrong-slide.
    const container = document.querySelector("[data-sidebar-sections]");
    const scrolled = container && container.scrollTop !== prevScrollTopRef.current;
    prevScrollTopRef.current = container?.scrollTop ?? 0;
    if (scrolled) {
      flushSync(mutate);
      return;
    }

    // Run the mutation synchronously so React commits before we measure "after".
    // ponytail: guard against flushSync failing (e.g. happy-dom's broken event
    // propagation). Fall back to direct call; FLIP degrades gracefully (no anim).
    try { flushSync(mutate); } catch { mutate(); }

    // Measure "after" tops and play FLIP
    const after = new Map<string, number>();
    document.querySelectorAll("[data-section-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      after.set(el.getAttribute("data-section-id")!, r.top);
    });

    const offsets = computeFlipOffsets(before, after, { reducedMotion: reduced });
    for (const { id, dy } of offsets) {
      const el = document.querySelector(`[data-section-id="${id}"]`) as HTMLElement | null;
      if (!el) continue;
      // Cancel any in-flight animation for this id
      const existing = animsRef.current.get(id);
      if (existing) existing.cancel();
      const anim = el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0px)" }],
        { duration: REORDER_DURATION_MS, easing: REORDER_EASE },
      );
      animsRef.current.set(id, anim);
    }
  }, []);
}
