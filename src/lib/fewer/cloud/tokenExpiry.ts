/** True when the token expires within the next minute (or already has). */
export function isTokenExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now() + 60_000;
}