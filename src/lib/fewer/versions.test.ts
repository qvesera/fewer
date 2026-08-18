import { test, expect } from "bun:test";
import { graphDataEqual } from "./versions";

test("graphDataEqual ignores object key order (jsonb normalizes it)", () => {
  const a = { nodes: [{ id: "n1", data: { label: "x" } }], direction: "TB", showFiles: true };
  const b = { showFiles: true, direction: "TB", nodes: [{ data: { label: "x" }, id: "n1" }] };
  expect(graphDataEqual(a, b)).toBe(true);
});

test("graphDataEqual distinguishes different values", () => {
  expect(graphDataEqual({ a: 1 }, { a: 2 })).toBe(false);
  expect(graphDataEqual(null, { a: 1 })).toBe(false);
  expect(graphDataEqual(undefined, undefined)).toBe(true);
});

test("graphDataEqual array order matters (node order is significant)", () => {
  const a = [{ id: "a" }, { id: "b" }];
  const b = [{ id: "b" }, { id: "a" }];
  expect(graphDataEqual(a, b)).toBe(false);
  expect(graphDataEqual(a, [...a])).toBe(true);
});

test("graphDataEqual catches missing/extra keys", () => {
  expect(graphDataEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  expect(graphDataEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
});