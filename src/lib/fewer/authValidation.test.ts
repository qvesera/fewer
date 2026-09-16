import { test, expect } from "bun:test";
import {
  errMessage,
  isValidEmail,
  validateAuthForm,
  type AuthFormInput,
} from "./authValidation";

const form = (over: Partial<AuthFormInput> = {}): AuthFormInput => ({
  mode: "signin",
  identifier: "user@example.com",
  password: "",
  confirmPassword: "",
  ...over,
});

test("isValidEmail accepts a plain address and rejects malformed ones", () => {
  expect(isValidEmail("user@example.com")).toBe(true);
  expect(isValidEmail("  user@example.com  ")).toBe(true);
  expect(isValidEmail("user@example")).toBe(false);
  expect(isValidEmail("user example.com")).toBe(false);
  expect(isValidEmail("")).toBe(false);
});

test("errMessage unwraps Error and falls back for other throwables", () => {
  expect(errMessage(new Error("boom"), "fallback")).toBe("boom");
  expect(errMessage("boom", "fallback")).toBe("fallback");
  expect(errMessage(undefined, "fallback")).toBe("fallback");
});

test("sign-in rejects an empty identifier", () => {
  const err = validateAuthForm(form({ identifier: "" }));
  expect(err?.field).toBe("email");
  expect(err?.message).toBe("Enter an email or username.");
  expect(err?.toast.title).toBe("Missing account");
});

test("sign-in rejects a malformed email but accepts a username", () => {
  expect(validateAuthForm(form({ identifier: "nope@nope" }))?.message).toBe(
    "Enter a valid email address.",
  );
  // No "@" means username — no email format check applies.
  expect(validateAuthForm(form({ identifier: "some user" }))).toBeNull();
  expect(validateAuthForm(form({ identifier: "yash" }))).toBeNull();
});

test("sign-in ignores password fields entirely", () => {
  expect(validateAuthForm(form({ password: "x", confirmPassword: "y" }))).toBeNull();
});

test("sign-up, reset and magic link all require a real email", () => {
  for (const mode of ["signup", "reset", "magic"] as const) {
    const err = validateAuthForm(form({ mode, identifier: "yash" }));
    expect(err?.field).toBe("email");
    expect(err?.toast.title).toBe("Invalid email");
  }
});

test("sign-up flags unmet password requirements with no inline message", () => {
  const err = validateAuthForm(
    form({ mode: "signup", password: "abc", confirmPassword: "abc" }),
  );
  expect(err?.message).toBe("");
  expect(err?.toast.title).toBe("Password requirements not met");
  expect(err?.toast.description).toContain("At least 8 characters");
});

test("sign-up flags a password mismatch on the confirm field", () => {
  const err = validateAuthForm(
    form({ mode: "signup", password: "Abcdefg1!", confirmPassword: "Abcdefg2!" }),
  );
  expect(err?.field).toBe("confirm");
  expect(err?.message).toBe("Passwords do not match.");
});

test("sign-up passes when email, policy and confirmation all hold", () => {
  expect(
    validateAuthForm(
      form({ mode: "signup", password: "Abcdefg1!", confirmPassword: "Abcdefg1!" }),
    ),
  ).toBeNull();
});

test("reset and magic link skip password validation", () => {
  for (const mode of ["reset", "magic"] as const) {
    expect(validateAuthForm(form({ mode, password: "", confirmPassword: "" }))).toBeNull();
  }
});
