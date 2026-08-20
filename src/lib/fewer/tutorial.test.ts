import { test, expect } from "bun:test";
import { getBeginnerChecklist } from "./tutorial";

const ids = (isTouch: boolean) => getBeginnerChecklist(isTouch).map((i) => i.id);

test("keyboard-shortcut step is only shown with a keyboard", () => {
  expect(ids(false)).toContain("shortcuts");
  expect(ids(true)).not.toContain("shortcuts");
});

test("touch devices keep the remaining steps", () => {
  expect(ids(true)).toEqual([
    "load-sample",
    "explore-nodes",
    "right-click",
    "search",
    "export",
  ]);
});