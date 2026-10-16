"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Eased scrolling for the marketing pages, plus the page's one gesture: the
 * first scroll takes the reader from the promise straight to the demo.
 *
 * Lenis keeps the browser's own scroll - it drives `window.scrollY`, not a
 * transformed div - so the sticky header, the `/#features` anchor, the
 * IntersectionObservers in the hero and the feature tour all keep working
 * exactly as they did, they just arrive with an easing curve instead of a
 * jump. It is mounted on the home page and nowhere else: the app's canvas
 * owns its own viewport through React Flow, and easing that would fight it.
 * prefers-reduced-motion and coarse pointers stay native (see the gates in
 * the effect), and the e2e pins the `lenis` class absence for reduced motion.
 *
 * The opening move is detected from a scroll event rather than from a wheel,
 * a key or a touch: one rule, every input method, and nothing to prevent - the
 * reader's first nudge is honoured and then finished for them, landing
 * `#features` just under the sticky header. The rule is "you left the top and
 * you are not yet at the demo", so a programmatic jump that starts below the
 * demo (the tests, the nav's own anchor) marks the move spent and keeps
 * scrolling on its own terms, and a page restored mid-scroll never gets one.
 *
 * The rAF chain is a single loop that dies with the component; nothing else
 * on the page owns it.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    let lenis: Lenis | null = null;
    let raf = 0;

    /** The header is a token, so the demo lands under it, not behind it. */
    const headerOffset = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--mk-header-h");
      return Number.parseFloat(raw) || 0;
    };

    /** Where `#features` would sit if the page were scrolled so that it is
     *  exactly one header below the top. Null when there is no demo yet. */
    const demoScrollTop = () => {
      const demo = document.getElementById("features");
      if (!demo) return null;
      return demo.getBoundingClientRect().top + window.scrollY - headerOffset();
    };

    // A page restored mid-scroll is already past the opening move.
    let taken = window.scrollY > 40;

    const onScroll = () => {
      if (taken) return;
      const y = window.scrollY;
      if (y <= 8) return; // still at rest: that is not a reader going anywhere
      const top = demoScrollTop();
      if (top === null || y >= top - 8) {
        // Already at, or past, the demo: ordinary scrolling from here.
        taken = true;
        return;
      }
      taken = true;
      if (lenis) {
        lenis.scrollTo(top, { duration: 0.9 });
      } else {
        window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    if (!reduced && !coarse && typeof requestAnimationFrame === "function") {
      lenis = new Lenis({ duration: 1.1 });
      const frame = (time: number) => {
        lenis?.raf(time);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);

  return null;
}
