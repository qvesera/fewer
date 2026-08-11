"use client";

// Global animate-clock for animated edge dashes.
//
// PROBLEM: the old CSS `animation: gm-edge-flow` animated `stroke-dashoffset`
// and restarted from 0 every time an edge path was (re)mounted. With
// `onlyRenderVisibleElements` on large graphs, edges crossing the viewport
// boundary unmount/remount constantly, so the dash phase kept jumping back to
// the start. On top of that, any fixed keyframe cycle visibly JUMPS unless the
// cycle distance is an exact multiple of the dash pattern period — the old
// 24px cycle jumped every loop for @xyflow's fallback `stroke-dasharray: 5`
// (period 10), which edges get when they carry no inline dasharray.
//
// FIX: a single rAF loop advances one shared offset and writes it to the CSS
// var `--gm-dash-offset` on <html>. Edges read that var instead of running a
// per-edge CSS animation, so a freshly mounted edge picks up the *current*
// phase — no reset, no jerk. The offset wraps only at a large common multiple
// of every dash period in use, so even the wrap is invisible. One loop drives
// every animated edge (cheap), ref-counted so it only runs while needed.

const PX_PER_MS = 24 / 1200; // 20 px/s — same speed as the old animation

// Wrap distance. MUST be a common multiple of every dash pattern period in
// play — "8 4"→12, "6 6"→12, "2 4"→6, "2 6"→8, and @xyflow's fallback
// "5"→10 — or the wrap shows as a periodic jump. 12,000 px ≈ 10 min at 20 px/s.
const WRAP = 12_000;

let rafId: number | null = null;
let subscribers = 0;

function setOffset(px: number) {
  document.documentElement.style.setProperty("--gm-dash-offset", `${px}px`);
}

function tick(now: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setOffset(0);
    return; // stay frozen; don't reschedule
  }
  setOffset(-((now * PX_PER_MS) % WRAP));
  rafId = requestAnimationFrame(tick);
}

export function startDashClock() {
  subscribers++;
  if (rafId === null && typeof document !== "undefined") {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOffset(0);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  }
}

export function stopDashClock() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}