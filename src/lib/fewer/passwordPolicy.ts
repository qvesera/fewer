/**
 * Password policy shared with the sign-up dialog and its tests.
 * Mirrors Supabase's default policy: 8+ chars with at least one lowercase,
 * uppercase, digit, and special character.
 */

/** Exact special-character set Supabase's default password policy requires. */
export const SPECIAL_CHARS = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~";

export interface PasswordHint {
  id: string;
  label: string;
  test: (p: string) => boolean;
}

/** Requirements matching Supabase's default password policy (8+ chars). */
export const PASSWORD_HINTS: PasswordHint[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "lower", label: "One lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "One uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "One number (0–9)", test: (p) => /[0-9]/.test(p) },
  {
    id: "special",
    label: "One special character",
    test: (p) => [...p].some((c) => SPECIAL_CHARS.includes(c)),
  },
];

/** Unmet password requirements. Empty array when the password satisfies the policy. */
export function unmetPasswordHints(p: string): PasswordHint[] {
  return PASSWORD_HINTS.filter((h) => !h.test(p));
}