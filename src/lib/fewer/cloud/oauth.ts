import "server-only";

/** Build the provider callback URL from NEXT_PUBLIC_APP_URL. */
export function callbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/cloud/callback`;
}

/** Random state token for CSRF protection of the OAuth flow. */
export function randomState(): string {
  return crypto.randomUUID();
}