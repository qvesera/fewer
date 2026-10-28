"use client";

import { useEffect, useRef } from "react";
import { useDevice } from "@/hooks/use-device";

/**
 * The page backdrop: the canvas dot grid, plus a feathered highlight that
 * trails the pointer (T-150). The glow layer is the same dots at a stronger
 * colour, revealed through a radial mask whose centre lerps toward the cursor,
 * so it feels like panning the app canvas rather than a CSS cursor.
 *
 * ponytail ceilings, named: the loop is a single rAF chain that stops once the
 * glow settles (no idle work), and touch / reduced-motion users only ever get
 * the static grid - the global prefers-reduced-motion rule cannot stop a JS
 * loop, so the gate lives here.
 */
export function DotGrid() {
  const glowRef = useRef<HTMLDivElement>(null);
  const { hasReducedMotion, isTouch } = useDevice();

  useEffect(() => {
    if (isTouch || hasReducedMotion) return;
    const el = glowRef.current;
    if (!el || typeof requestAnimationFrame !== "function") return;

    let targetX = -300;
    let targetY = -300;
    let x = -300;
    let y = -300;
    let raf = 0;

    const paint = () => {
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      el.style.setProperty("--mk-x", `${x.toFixed(1)}px`);
      el.style.setProperty("--mk-y", `${y.toFixed(1)}px`);
      if (Math.abs(targetX - x) < 0.5 && Math.abs(targetY - y) < 0.5) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(paint);
    };

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      el.dataset.on = "1";
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      el.dataset.on = "0";
      targetX = -300;
      targetY = -300;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) onLeave();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isTouch, hasReducedMotion]);

  return (
    <div className="mk-backdrop" aria-hidden="true">
      <div className="mk-dotgrid" />
      <div ref={glowRef} className="mk-dotglow" />
    </div>
  );
}
