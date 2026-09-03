import { useEffect } from "react";
import { startDashClock, stopDashClock } from "@/lib/fewer/dashClock";

/**
 * Run the shared edge-dash clock only while animated edges are enabled.
 * The loop writes --gm-dash-offset (see dashClock.ts) so edge (re)mounts
 * inherit the current phase instead of restarting a CSS animation.
 */
export function useCanvasDashClock(
  advancedModeEnabled: boolean,
  edgeAnimated: boolean,
  edgeAnimatedSelectedOnly: boolean,
) {
  useEffect(() => {
    if (!advancedModeEnabled || !(edgeAnimated || edgeAnimatedSelectedOnly)) return;
    startDashClock();
    return stopDashClock;
  }, [advancedModeEnabled, edgeAnimated, edgeAnimatedSelectedOnly]);
}
