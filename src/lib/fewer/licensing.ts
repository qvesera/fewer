/**
 * The Pro/licensing rail, as one switch (T-148).
 *
 * The desktop shell ships with Pro ABSENT rather than locked: while the switch
 * is off the shell tier is pinned to `free`, the License settings tab does not
 * exist, and no user-facing copy mentions Pro — there is no path for a user to
 * enable it (no licence picker, no billing redirect, no upgrade prompt).
 *
 * Turning it on is a BUILD, not a refactor: set
 * `NEXT_PUBLIC_LICENSING_ENABLED=1` at build time. Keep it off until a real
 * purchase path exists (a payment method that works in every market you sell
 * to). Flip lives in `shellTier` + `visibleTabs` — both read this module.
 *
 * The web app is untouched: web Pro is the server-side `profiles.plan` ladder,
 * which this switch deliberately does not gate.
 */
import type { Tier } from "./tiers";

/** True only when the build opted in with `NEXT_PUBLIC_LICENSING_ENABLED=1`. */
export const LICENSING_ENABLED = process.env.NEXT_PUBLIC_LICENSING_ENABLED === "1";

/**
 * The desktop shell's tier — pure, so both switch states are testable.
 *
 * Off → always `"free"`: a valid `.fewerlicense` file AND a `?tier=pro`
 * override are both ignored. That is also what closes the override bypass in a
 * packaged build: a static app has no server to enforce anything against, so
 * client-side pinning is the only line there is.
 *
 * On → the pre-T-148 chain: dev override, then the licence, then `"free"`
 * (the shell is never `guest` — that would blank the advanced UI).
 */
export function shellTier(
  licensed: Tier | null,
  override: Tier | null,
  enabled: boolean = LICENSING_ENABLED,
): Tier {
  if (!enabled) return "free";
  return override ?? licensed ?? "free";
}
