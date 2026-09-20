import { describe, test, expect } from "bun:test";
import { isSingleFileSelected, isAdvancedFormatOnly } from "./exportPanelModel";

const fileNode = { id: "f1", data: { type: "file" } } as any;
const folderNode = { id: "d1", data: { type: "folder" } } as any;
const nodes = [fileNode, folderNode];
const ADV_VALS = ["svg", "json", "csv", "dot", "script"];

describe("isSingleFileSelected", () => {
  test("single file node + non-image format → true", () => {
    expect(isSingleFileSelected(["f1"], "json", nodes)).toBe(true);
  });
  test("single file node + image format → false", () => {
    expect(isSingleFileSelected(["f1"], "png", nodes)).toBe(false);
    expect(isSingleFileSelected(["f1"], "svg", nodes)).toBe(false);
  });
  test("single folder node → false", () => {
    expect(isSingleFileSelected(["d1"], "json", nodes)).toBe(false);
  });
  test("multiple selections → false", () => {
    expect(isSingleFileSelected(["f1", "d1"], "json", nodes)).toBe(false);
  });
  test("no selection → false", () => {
    expect(isSingleFileSelected([], "json", nodes)).toBe(false);
  });
});

describe("isAdvancedFormatOnly", () => {
  test("json → true", () => expect(isAdvancedFormatOnly("json", ADV_VALS)).toBe(true));
  test("png → false", () => expect(isAdvancedFormatOnly("png", ADV_VALS)).toBe(false));
  test("unknown format → false", () => expect(isAdvancedFormatOnly("xlsx", ADV_VALS)).toBe(false));
});
