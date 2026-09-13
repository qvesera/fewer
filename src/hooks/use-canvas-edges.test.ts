import { describe, expect, test } from "bun:test";
import type { EdgeChange } from "@xyflow/react";
import type { FewerEdge } from "@/lib/fewer/types";
import { trackEdgeSelection } from "./use-canvas-edges";

const select = (id: string, selected: boolean) =>
  ({ id, type: "select", selected }) as unknown as EdgeChange<FewerEdge>;
const remove = (id: string) =>
  ({ id, type: "remove" }) as unknown as EdgeChange<FewerEdge>;
const add = () => ({ type: "add", item: { id: "new" } }) as unknown as EdgeChange<FewerEdge>;

describe("trackEdgeSelection", () => {
  test("adds selected ids", () => {
    const live = new Set<string>();
    trackEdgeSelection(live, [select("e1", true), select("e2", true)]);
    expect([...live]).toEqual(["e1", "e2"]);
  });

  test("deselect removes the id", () => {
    const live = new Set(["e1", "e2"]);
    trackEdgeSelection(live, [select("e1", false)]);
    expect([...live]).toEqual(["e2"]);
  });

  test("remove drops the id even when it was not reported as selected", () => {
    const live = new Set(["e1"]);
    trackEdgeSelection(live, [remove("e1")]);
    expect([...live]).toEqual([]);
  });

  test("add changes are ignored (no id to track)", () => {
    const live = new Set(["e1"]);
    trackEdgeSelection(live, [add()]);
    expect([...live]).toEqual(["e1"]);
  });

  test("an empty change batch leaves the set untouched", () => {
    const live = new Set(["e1"]);
    trackEdgeSelection(live, []);
    expect([...live]).toEqual(["e1"]);
  });

  test("deselect then reselect in one batch keeps the id", () => {
    const live = new Set(["e1"]);
    trackEdgeSelection(live, [select("e1", false), select("e1", true)]);
    expect([...live]).toEqual(["e1"]);
  });
});
