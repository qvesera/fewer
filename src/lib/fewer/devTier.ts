import type { Tier } from "./tiers";

/**
 * Dev-only tier override: `?tier=pro|free|guest` forces the client tier.
 *
 * The Pro surface (split views, docking, tags) is otherwise unreachable without
 * a real Pro account, so it went untested — #283, a hydration mismatch that only
 * shows up with a stored two-view workspace, was invisible to CI and to every
 * guest session because of exactly that. This is a **UI** override: the server
 * still enforces the real plan, so it only makes gated controls render.
 *
 * It lives deliberately outside `tierOf`, which is a pure derivation used across
 * the app: several src test files install a global `window` **without** a
 * `location` (`globalThis.window = globalThis`), so an ambient URL read inside
 * `tierOf` threw depending on the runner's file order — green locally, red in
 * CI. Everything here therefore takes the query string as a parameter, and the
 * default reader tolerates any shape of `window`.
 *
 * Guarded on `NODE_ENV !== "production"` so a production build can never honour it.
 */
function currentSearch(): string {
  try {
    return typeof window === "undefined" ? "" : (window.location?.search ?? "");
  } catch {
    // A test-environment `window` may expose a location getter that throws.
    return "";
  }
}

/**
 * `?tier=pro|free|guest` in a development build → that tier.
 * `null` means "no override — derive the tier normally".
 */
export function devTierOverride(search: string = currentSearch()): Tier | null {
  if (process.env.NODE_ENV === "production") return null;
  const forced = new URLSearchParams(search).get("tier");
  return forced === "guest" || forced === "free" || forced === "pro" ? forced : null;
}