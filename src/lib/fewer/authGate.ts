/**
 * Auth gate for gallery deep links. Dependency-free on purpose: imported
 * statically by FewerApp, so it must not pull `share.ts` (and its lz-string
 * dependency) into the app's startup bundle.
 */

/**
 * sessionStorage key for a hash that must be held until sign-in succeeds.
 * sessionStorage (not a ref) because GitHub/Google sign-in is a full-page
 * OAuth redirect — an in-memory ref would lose the intent across the round trip.
 */
export const PENDING_AUTH_HASH_KEY = "fewer-pending-auth-hash";

/**
 * True when a gallery deep link must NOT be processed yet — it arrived with
 * `?auth=open` (the gallery only adds that when the visitor is signed out), so
 * the theme/graph is held until sign-in succeeds.
 *
 * Reads the query string rather than the user state: `useAuth()` resolves the
 * session asynchronously, so `user` is null at mount even for a signed-in
 * visitor. Once the sign-in effect clears the param, this can no longer defer.
 */
export function shouldDeferHashForAuth(
  search: string,
  hash: string,
  hasUser: boolean,
): boolean {
  if (!hash) return false;
  if (hasUser) return false;
  return new URLSearchParams(search).get("auth") === "open";
}
