import { describe, expect, test } from "bun:test";
import { serverError, apiErrorMessage, isShareExpired, profileFieldsRejected } from "./apiHelpers";

/** Set NODE_ENV for one assertion, restoring exactly (delete when unset). */
function withNodeEnv<T>(value: string | undefined, fn: () => T): T {
  // NODE_ENV is typed readonly; route around it for one assertion.
  const env = process.env as Record<string, string | undefined>;
  const prev = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prev;
  }
}

describe("serverError", () => {
  test("Error → 500 with message", () => {
    const res = serverError(new Error("boom"));
    expect(res.status).toBe(500);
    return res.json().then((j) => expect(j.error).toBe("boom"));
  });
  test("non-Error → 500 with 'Unknown error'", () => {
    const res = serverError("oops");
    expect(res.status).toBe(500);
    return res.json().then((j) => expect(j.error).toBe("Unknown error"));
  });
  test("Supabase-style error objects keep their message outside production", () => {
    const res = serverError({ message: "permission denied for table profiles" });
    expect(res.status).toBe(500);
    return res.json().then((j) =>
      expect(j.error).toBe("permission denied for table profiles"),
    );
  });
  test("production echoes a generic message, never the detail (audit F-4)", () => {
    return withNodeEnv("production", () => {
      const res = serverError(new Error("schema internals leaked"));
      expect(res.status).toBe(500);
      return res.json().then((j) => expect(j.error).toBe("Internal server error"));
    });
  });
});

describe("apiErrorMessage", () => {
  test("non-production returns the extracted detail", () => {
    expect(apiErrorMessage(new Error("boom"))).toBe("boom");
    expect(apiErrorMessage({ message: "pg error" })).toBe("pg error");
    expect(apiErrorMessage("oops")).toBe("Unknown error");
  });
  test("production returns the generic message", () => {
    withNodeEnv("production", () => {
      expect(apiErrorMessage(new Error("boom"))).toBe("Internal server error");
    });
  });
});

describe("isShareExpired", () => {
  test("null/undefined → false", () => {
    expect(isShareExpired(null)).toBe(false);
    expect(isShareExpired(undefined)).toBe(false);
  });
  test("future date → false", () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(isShareExpired(future)).toBe(false);
  });
  test("past date → true", () => {
    expect(isShareExpired("2000-01-01T00:00:00Z")).toBe(true);
  });
});

describe("profileFieldsRejected", () => {
  test("valid input → null", () => {
    expect(profileFieldsRejected({ first_name: "Ada", last_name: "Lovelace", username: "ada" })).toBeNull();
  });

  test("null/undefined values are accepted (they're optional)", () => {
    expect(profileFieldsRejected({ first_name: null, last_name: null, username: null })).toBeNull();
    expect(profileFieldsRejected({ first_name: undefined, last_name: undefined, username: undefined })).toBeNull();
    // And multiple dangerous values simultaneously → still the same single error
    expect(profileFieldsRejected({ first_name: "null", last_name: "null", username: "null" })).toBe("Profile contains invalid text");
  });

  test("101-char name → rejected", () => {
    const long = "A".repeat(101);
    expect(profileFieldsRejected({ first_name: long, last_name: "", username: "ada" })).toBe("Profile contains invalid text");
    expect(profileFieldsRejected({ first_name: "", last_name: long, username: "ada" })).toBe("Profile contains invalid text");
  });

  test("username with '@' → rejected", () => {
    expect(profileFieldsRejected({ first_name: "", last_name: "", username: "ada@foo" })).toBe("Profile contains invalid text");
  });

  test("101-char username → rejected", () => {
    const long = "a".repeat(101);
    expect(profileFieldsRejected({ first_name: "", last_name: "", username: long })).toBe("Profile contains invalid text");
  });

  test("dangerous values → rejected", () => {
    for (const bad of ["null", "[object Object]", "{}", "undefined"]) {
      const result = profileFieldsRejected({ first_name: bad, last_name: "ok", username: "ok" });
      expect(result, `first_name="${bad}"`).toBe("Profile contains invalid text");
    }
  });

  test("multiple dangerous fields simultaneously → same error (single error path)", () => {
    const result = profileFieldsRejected({ first_name: "null", last_name: "{}", username: "undefined" });
    expect(result).toBe("Profile contains invalid text");
  });
});
