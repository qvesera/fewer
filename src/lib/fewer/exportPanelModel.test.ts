import { describe, test, expect } from "bun:test";
import {
  changesFormatDesc,
  folderFormatDesc,
  isSingleFileSelected,
  isAdvancedFormatOnly,
  qualityToScale,
  scaleToQuality,
  formatScale,
  QUALITY_MIN,
  QUALITY_MAX,
} from "./exportPanelModel";

const fileNode = { id: "f1", data: { type: "file" } } as any;
const folderNode = { id: "d1", data: { type: "folder" } } as any;
const nodes = [fileNode, folderNode];
const ADV_VALS = ["svg", "json", "csv", "dot", "script"];

describe("format desc (platform-aware labels)", () => {
  test("folderFormatDesc returns .bat on Windows", () => {
    expect(folderFormatDesc(true)).toBe("Folder structure (.bat)");
  });

  test("folderFormatDesc returns .sh on non-Windows", () => {
    expect(folderFormatDesc(false)).toBe("Folder structure (.sh)");
  });

  test("changesFormatDesc returns .bat on Windows", () => {
    expect(changesFormatDesc(true)).toBe("Replay your edits (.bat)");
  });

  test("changesFormatDesc returns .sh on non-Windows", () => {
    expect(changesFormatDesc(false)).toBe("Replay your edits (.sh)");
  });
});

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

describe("quality → scale mapping", () => {
  test("the slider's ends are exactly 1× and 2×", () => {
    expect(qualityToScale(QUALITY_MIN)).toBe(1);
    expect(qualityToScale(QUALITY_MAX)).toBe(2);
    expect(qualityToScale(80)).toBeCloseTo(1.6, 6);
  });

  test("legacy values below the range read as 1×, never smaller", () => {
    expect(qualityToScale(10)).toBe(1);
    expect(qualityToScale(1)).toBe(1);
    expect(qualityToScale(0)).toBe(1);
    expect(qualityToScale(-40)).toBe(1);
  });

  test("scaleToQuality inverts qualityToScale across the range", () => {
    for (const quality of [50, 55, 80, 100]) {
      expect(scaleToQuality(qualityToScale(quality))).toBe(quality);
    }
  });

  test("a typed scale clamps into the slider's range", () => {
    expect(scaleToQuality(0.5)).toBe(QUALITY_MIN);
    expect(scaleToQuality(3)).toBe(QUALITY_MAX);
    expect(scaleToQuality(1.75)).toBe(88);
    expect(QUALITY_MIN).toBe(50);
    expect(QUALITY_MAX).toBe(100);
  });

  test("formatScale prints a clean readout, never a float tail", () => {
    expect(formatScale(1)).toBe("1");
    expect(formatScale(1.6)).toBe("1.6");
    expect(formatScale(qualityToScale(55))).toBe("1.1");
    expect(formatScale(1.0000000000000002)).toBe("1");
  });
});
