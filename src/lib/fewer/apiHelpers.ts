import { NextResponse } from "next/server";
import { isDangerousText, safeText, validateUsername } from "./textValidation";

/** Shared catch tail for API route handlers: normalize a thrown error into a
 *  500 response with `{ error: message }`. */
export function serverError(err: unknown): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Unknown error" },
    { status: 500 },
  );
}

/** True when a share row's expiry has passed (NULL/absent = never expires). */
export function isShareExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * Server-side guard for profile PUT fields.  Returns an error message string
 * when `first_name`, `last_name`, or `username` are dangerous (injection
 * attempts), over 100 chars, or when `username` contains `@` (breaks the
 * email-vs-username login detection).
 *
 * Exported so tests can prove every error path; the route calls it and
 * translates a truthy return into a 400.
 */
export function profileFieldsRejected(fields: {
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
}): string | null {
  const bad = (v: unknown) => v !== undefined && v !== null && isDangerousText(v);

  if (bad(fields.first_name) || bad(fields.last_name) || bad(fields.username)) {
    return "Profile contains invalid text";
  }

  const username = safeText(fields.username).toLowerCase();
  const usernameError = validateUsername(username, { label: "Username", max: 100 });
  if (usernameError) return "Profile contains invalid text";

  const firstName = safeText(fields.first_name);
  const lastName = safeText(fields.last_name);
  if (firstName.length > 100 || lastName.length > 100) {
    return "Profile contains invalid text";
  }

  return null;
}
