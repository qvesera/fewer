import { describe, expect, test } from "bun:test";
import { readFewerChildPayload } from "./dropImport";

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
