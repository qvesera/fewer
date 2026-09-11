import { NextResponse } from "next/server";

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
