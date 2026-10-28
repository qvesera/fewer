import { describe, expect, test } from "bun:test";
import { droppedPathOf, readFewerChildPayload } from "./dropImport";

function fakeDataTransfer(getDataResult: string): DataTransfer {
  return {
    getData: (type: string) => (type === "application/fewer-child" ? getDataResult : ""),
    dropEffect: "none",
    effectAllowed: "none",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[],
    setData: () => {},
    setDragImage: () => {},
    clearData: () => {},
  } as DataTransfer;
}

describe("readFewerChildPayload", () => {
  test("returns the internal payload when present", () => {
    const dt = fakeDataTransfer('{"label":"src","type":"folder","parentId":"n-abc"}');
    expect(readFewerChildPayload(dt)).toBe('{"label":"src","type":"folder","parentId":"n-abc"}');
  });

  test("returns empty string for external drops", () => {
    const dt = fakeDataTransfer("");
    expect(readFewerChildPayload(dt)).toBe("");
  });

  test("returns empty string when getData throws", () => {
    const dt = { getData: () => { throw new Error("crash"); } } as unknown as DataTransfer;
    expect(readFewerChildPayload(dt)).toBe("");
  });
});

describe("droppedPathOf", () => {
  const file = new File(["x"], "notes.md");

  test("resolves the first dropped file to its absolute path", () => {
    expect(droppedPathOf([file], () => "/home/u/notes.md")).toBe("/home/u/notes.md");
  });

  test("returns null when nothing was dropped", () => {
    expect(droppedPathOf([], () => "/x")).toBeNull();
    expect(droppedPathOf(null, () => "/x")).toBeNull();
    expect(droppedPathOf(undefined, () => "/x")).toBeNull();
  });

  test("returns null when the bridge has no path for the file", () => {
    // webUtils returns "" for a File built in JS (not backed by disk).
    expect(droppedPathOf([file], () => "")).toBeNull();
  });

  test("returns null when the path helper throws", () => {
    expect(
      droppedPathOf([file], () => { throw new Error("not a File"); }),
    ).toBeNull();
  });
});
