import { describe, expect, it } from "bun:test";
import { isDangerousText, safeText, validateTextField, validateUsername } from "./textValidation";

describe("textValidation", () => {
  it("flags broken/interpolated values that must never reach the DB", () => {
    for (const bad of ["null", " undefined ", "NaN", "[object Object]", "[OBJECT OBJECT]", "[object Array]", "{}", "[]"]) {
      expect(isDangerousText(bad), `should reject "${bad}"`).toBe(true);
    }
    // A real object / number / null passed in directly is also rejected.
    expect(isDangerousText(null)).toBe(true);
    expect(isDangerousText({ statement: "x" })).toBe(true);
    expect(isDangerousText(42)).toBe(true);
  });

  it("trims and accepts normal text", () => {
    expect(isDangerousText("  Ada  ")).toBe(false);
    expect(safeText("  Ada  ")).toBe("Ada");
    expect(validateTextField("Ada", { label: "First name", max: 100 })).toBeNull();
  });

  it("enforces required-ness and length", () => {
    expect(isDangerousText("   ")).toBe(false);
    expect(validateTextField("   ", { label: "Name", required: true })).toBe("Name can't be empty.");
    expect(validateTextField("123456", { label: "Name", max: 3 })).toBe("Name must be 3 characters or fewer.");
  });

  it("bans '@' in usernames (so login can distinguish email from username)", () => {
    expect(validateUsername("  ada ")).toBeNull();
    expect(validateUsername("")).toBeNull();
    expect(validateUsername("ada_lovelace")).toBeNull();
    expect(validateUsername("a@b", { label: "Username" })).toBe("Username can't contain \"@\".");
    expect(validateUsername("@ada")).not.toBeNull();
  });
});