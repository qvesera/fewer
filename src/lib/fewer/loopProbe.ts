"use client";

/**
 * Dev-only probe for the canvas update chain (#281).
 *
 * The store → canvas → React Flow → store round trip that chains into React's
 * "Maximum update depth exceeded" only showed up on a machine whose commit
 * timing differs from CI, so it is counted here instead of guessed at: append
 * `?debugLoop=1` to the URL, reproduce, and every burst prints which writers
 * fired and how often.
 *
 * ponytail: one module, one counter, one line per call site — delete it with the
 * bug once the chain is closed. A no-op unless the flag is present, so the cost
 * in production is a single `location.search` read per call.
 */

const WINDOW_MS = 150;
/** React gives up at 50 nested updates; warn well before that. */
const BURST_LIMIT = 25;

let samples: { t: number; tag: string }[] = [];
let warned = false;

export function loopProbeEnabled(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("debugLoop");
  } catch {
    return false;
  }
}

/** Record one update-chain step, and report when a burst looks like the loop. */
export function markLoop(tag: string): void {
  if (!loopProbeEnabled()) return;
  const now = performance.now();
  samples.push({ t: now, tag });
  const cutoff = now - WINDOW_MS;
  samples = samples.filter((s) => s.t >= cutoff);
  if (samples.length < BURST_LIMIT || warned) return;
  warned = true;
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.tag, (counts.get(s.tag) ?? 0) + 1);
  const digest = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => `${tag}=${n}`).join(" ");
  console.warn(`[loop] ${samples.length} canvas updates in ${WINDOW_MS}ms: ${digest}`);
  setTimeout(() => { samples = []; warned = false; }, 1000);
}