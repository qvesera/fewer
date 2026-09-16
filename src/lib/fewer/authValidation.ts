/**
 * Pure validation for the auth dialogs (sign in / sign up / reset / magic link).
 *
 * Framework-agnostic — no React, no Supabase, no browser globals — so the whole
 * decision tree is unit-testable and BOTH `AuthDialog` and `SettingsDialog`
 * share the same email check and error-message helper instead of keeping
 * private copies of each.
 */

import { unmetPasswordHints } from "./passwordPolicy";

export type AuthMode = "signin" | "signup" | "reset" | "magic";

/** Basic email format check (RFC-ish: no spaces, one @, a dot after it). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `value` looks like an email address. Blank/whitespace is not. */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Human-readable message for an unknown thrown value — Supabase returns plain
 * objects in some paths, browser APIs throw strings. Falls back to a
 * caller-supplied context string so the toast is never empty.
 */
export function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export interface AuthFormInput {
  mode: AuthMode;
  /** Trimmed email/username field value. */
  identifier: string;
  password: string;
  confirmPassword: string;
}

export interface AuthFormError {
  /** Field the inline message belongs to. */
  field: "email" | "confirm";
  /** Inline message under the field. `""` when only a toast is shown. */
  message: string;
  /** Toast shown alongside the inline message (always `destructive`). */
  toast: { title: string; description: string };
}

/**
 * Validates one submit of the auth form. Returns `null` when the input may be
 * sent, otherwise the first blocking error.
 *
 * Sign-in auto-detects email vs username: an "@" means an email, anything else
 * is a username (usernames can't contain "@", so this is unambiguous), and only
 * emails get the format check. Sign-up / reset / magic-link always use a real
 * email. Password rules only apply to sign-up.
 */
export function validateAuthForm(input: AuthFormInput): AuthFormError | null {
  const { mode, identifier, password, confirmPassword } = input;

  if (mode === "signin") {
    if (!identifier) {
      return {
        field: "email",
        message: "Enter an email or username.",
        toast: { title: "Missing account", description: "Enter your email or username." },
      };
    }
    if (identifier.includes("@") && !isValidEmail(identifier)) {
      return invalidEmail();
    }
  } else if (!isValidEmail(identifier)) {
    return invalidEmail();
  }

  if (mode !== "signup") return null;

  // Field-level validation before submitting (matches Supabase's policy).
  const unmet = unmetPasswordHints(password);
  if (unmet.length) {
    return {
      field: "email",
      message: "",
      toast: {
        title: "Password requirements not met",
        description: unmet.map((h) => h.label).join(", "),
      },
    };
  }
  if (password !== confirmPassword) {
    return {
      field: "confirm",
      message: "Passwords do not match.",
      toast: {
        title: "Passwords do not match",
        description: "Re-enter the password in both fields.",
      },
    };
  }
  return null;
}

function invalidEmail(): AuthFormError {
  return {
    field: "email",
    message: "Enter a valid email address.",
    toast: { title: "Invalid email", description: "Enter a valid email address." },
  };
}
