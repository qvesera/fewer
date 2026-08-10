import { test, expect } from "bun:test";
import {
  SPECIAL_CHARS,
  PASSWORD_HINTS,
  unmetPasswordHints,
} from "./passwordPolicy";

const specialHint = () => PASSWORD_HINTS.find((h) => h.id === "special")!;

test("accepts a password meeting every requirement", () => {
  expect(unmetPasswordHints("Abcdefg1!")).toEqual([]);
});

test("flags every unmet requirement", () => {
  const ids = unmetPasswordHints("abc").map((h) => h.id);
  expect(ids).toContain("length");
  expect(ids).toContain("upper");
  expect(ids).toContain("number");
  expect(ids).toContain("special");
  expect(ids).not.toContain("lower");
});

test("special check covers the exact Supabase set", () => {
  for (const c of [...SPECIAL_CHARS]) {
    expect(specialHint().test(`Aa1${c}`)).toBe(true);
  }
  expect(specialHint().test("Aa1B2c3")).toBe(false);
});

test("length boundary is exactly 8", () => {
  expect(unmetPasswordHints("Abcdef1!")).toEqual([]);
  expect(unmetPasswordHints("Abcdef1").map((h) => h.id)).toContain("length");
});