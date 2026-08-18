"use client";

/**
 * Client-side sanitisation for text the user types that is persisted to the
 * database.
 *
 * Guards against broken values ever reaching the DB — e.g. the literal strings
 * `"null"`, `"undefined"`, `"[object Object]"` that can show up when a value is
 * interpolated into a field instead of real text — normalises surrounding
 * whitespace, and enforces a length cap. Every dialog that writes user text
 * calls `validateTextField` (or `isDangerousText`) before POSTing to its API
 * route, as a first line of defence on top of the server-side checks.
 */

/** Exact values that must never be stored as user text (compared after trim+lowercase). */
export const INVALID_TEXT_VALUES: readonly string[] = [
  "null",
  "undefined",
  "nan",
  "{}",
  "{ }",
  "[]",
  "[ ]",
];

/**
 * Any Object.prototype.toString() tag (e.g. `[object Object]`, `[object Array]`,
 * `[object Undefined]`, `[object Number]`). Case/spacing-insensitive.
 */
const OBJECT_TAG_RE = /^\[object(?: [a-z ]+)?\]$/i;

/** Control characters (other than tab/newline) that shouldn't be stored. */
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000e-\u001f\u007f]/;

/**
 * True when a value is not usable text: a non-string (e.g. null, an object, a
 * number), or a trimmed+lowercased string that is a known invalid token, an
 * object `.toString()`, or contains control characters. Empty/whitespace-only
 * strings return false here — required-ness is a separate check.
 */
export function isDangerousText(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const s = value.trim().toLowerCase();
  if (!s) return false;
  if (OBJECT_TAG_RE.test(s)) return true;
  if (INVALID_TEXT_VALUES.includes(s)) return true;
  if (CONTROL_CHAR_RE.test(value)) return true;
  return false;
}

/**
 * Trims surrounding whitespace and returns a safe string. Non-strings and
 * dangerous values become `""` so callers never POST a broken token. Prefer
 * pairing with `validateTextField` so the user actually sees an error.
 */
export function safeText(value: unknown): string {
  return isDangerousText(value) ? "" : typeof value === "string" ? value.trim() : "";
}

export interface TextFieldOptions {
  /** Reject empty/whitespace-only values. Default false. */
  required?: boolean;
  /** Maximum length after trimming. Default 200. */
  max?: number;
  /** Human-readable field name used in error messages. Default "Text". */
  label?: string;
}

/**
 * Returns a human-readable error string when `value` is not safe to store, or
 * `null` when it is. Blocking conditions, in order:
 *   1. `isDangerousText` (non-string, "null", "[object Object]", control chars, …)
 *   2. `required` is set and the value is empty/whitespace-only
 *   3. longer than `max` characters (after trimming)
 */
export function validateTextField(
  value: unknown,
  options: TextFieldOptions = {},
): string | null {
  const { required = false, max = 200, label = "Text" } = options;

  if (isDangerousText(value)) {
    return `${label} has an invalid value and can't be saved.`;
  }
  const s = typeof value === "string" ? value.trim() : "";
  if (required && !s) {
    return `${label} can't be empty.`;
  }
  if (s.length > max) {
    return `${label} must be ${max} characters or fewer.`;
  }
  return null;
}