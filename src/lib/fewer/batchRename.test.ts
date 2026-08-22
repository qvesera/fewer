import { describe, it, expect } from "bun:test";
import { applyBatchRename } from "./batchRename";

describe("applyBatchRename", () => {
  it("leaves labels untouched with empty options", () => {
    expect(applyBatchRename("utils", {}, 0)).toBe("utils");
  });

  it("replaces all occurrences of find", () => {
    expect(applyBatchRename("old-old-file", { find: "old", replace: "new" }, 0)).toBe("new-new-file");
  });

  it("find without replace deletes the match", () => {
    expect(applyBatchRename("prefix-name", { find: "prefix-" }, 0)).toBe("name");
  });

  it("applies prefix and suffix", () => {
    expect(applyBatchRename("mid", { prefix: "a_", suffix: "_z" }, 0)).toBe("a_mid_z");
  });

  it("numbers from numberStart using the item index", () => {
    expect(applyBatchRename("f", { numbered: true }, 0)).toBe("f 1");
    expect(applyBatchRename("f", { numbered: true, numberStart: 10 }, 2)).toBe("f 12");
  });

  it("chains all options in order: replace → affixes → number", () => {
    expect(
      applyBatchRename("report", { find: "report", replace: "q1", prefix: "[", suffix: "]", numbered: true }, 1),
    ).toBe("[q1] 2");
  });
});
