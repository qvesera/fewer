import { describe, test, expect } from "bun:test";
import { isStepComplete, shouldAutoDismiss } from "./tutorialModel";

const state: Record<string, unknown> = {
  selectedNodeIds: ["n1"],
  dataSource: "sample",
  hiddenIds: ["h1"],
};

const withWatch = {
  id: "select",
  icon: null as any,
  label: "Select",
  description: "Click a node",
  watchState: { key: "selectedNodeIds", value: null as null },
};

const withValue = {
  id: "imported",
  icon: null as any,
  label: "Import",
  description: "Import a directory",
  watchState: { key: "dataSource", value: "directory" as string },
};

const noWatch = {
  id: "manual",
  icon: null as any,
  label: "Manual",
  description: "Do it manually",
};

describe("isStepComplete", () => {
  test("already in done list", () => {
    expect(isStepComplete(state, withWatch, ["select"])).toBe(true);
  });
  test("no watchState → false", () => {
    expect(isStepComplete(state, noWatch, [])).toBe(false);
  });
  test("watchState null + selectedNodeIds has entries → true", () => {
    expect(isStepComplete(state, withWatch, [])).toBe(true);
  });
  test("watchState null + selectedNodeIds empty → false", () => {
    expect(isStepComplete({ selectedNodeIds: [] }, withWatch, [])).toBe(false);
  });
  test("watchState with value: exact match → true", () => {
    expect(isStepComplete({ dataSource: "directory" }, withValue, [])).toBe(true);
  });
  test("watchState with value: mismatch → false", () => {
    expect(isStepComplete(state, withValue, [])).toBe(false);
  });
});

describe("shouldAutoDismiss", () => {
  test("dismissed + no restart → true", () => {
    expect(shouldAutoDismiss(true, 0)).toBe(true);
  });
  test("dismissed + restart → false", () => {
    expect(shouldAutoDismiss(true, 1)).toBe(false);
  });
  test("not dismissed → false", () => {
    expect(shouldAutoDismiss(false, 0)).toBe(false);
  });
});
