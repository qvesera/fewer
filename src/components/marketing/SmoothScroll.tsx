"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Eased scrolling for the marketing pages (T-161 follow-up).
 *
 * Lenis keeps the browser's own scroll - it drives `window.scrollY`, not a
 * transformed div - so the sticky header, the `/#features` anchor, the
 * IntersectionObservers in the hero and the feature tour all keep working
 * exactly as they did, they just arrive with an easing curve instead of a
 * jump. It is mounted on the home page and nowhere else: the app's canvas
 * owns its own viewport through React Flow, and easing that would fight it.
 *
 * Two things it deliberately does not touch:
 *  - prefers-reduced-motion: Lenis IS motion the reader asked to keep out, so
 *    the page falls back to native scroll. The e2e pins this by asserting the
 *    `lenis` class never reaches <html>.
 *  - coarse pointers: a touch screen already has inertia from the OS, and
 *    `syncTouch` is off in every sane setup. Native wins there.
 *
 * The rAF chain is a single loop that dies with the component; nothing else
 * on the page owns it.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (typeof requestAnimationFrame !== "function") return;

    const lenis = new Lenis({ duration: 1.1 });
    let raf = 0;
    const frame = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
