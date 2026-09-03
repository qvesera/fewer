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

  it("replaces extensions when find matches the extension", () => {
    expect(applyBatchRename("Button.tsx", { find: ".tsx", replace: ".jsx" }, 0)).toBe("Button.jsx");
  });

  it("inserts affixes before the extension", () => {
    expect(applyBatchRename("Button.tsx", { prefix: "v2-", suffix: "_old" }, 0)).toBe("v2-Button_old.tsx");
  });

  it("numbers before the extension", () => {
    expect(applyBatchRename("f.tsx", { numbered: true }, 0)).toBe("f 1.tsx");
  });

  it("can remove an extension via empty replacement", () => {
    expect(applyBatchRename("f.tsx", { find: ".tsx" }, 0)).toBe("f");
  });

    it("treats dotfiles as having no extension", () => {
    expect(applyBatchRename(".gitignore", { suffix: "_bak" }, 0)).toBe(".gitignore_bak");
  });

  it("wildcard * matches everything (rename everything without retyping)", () => {
    expect(applyBatchRename("Button.tsx", { find: "*", replace: "Photo *" }, 0)).toBe("Photo Button.tsx");
  });

  it("wildcard find with literal prefix captures the rest", () => {
    expect(applyBatchRename("IMG_001.png", { find: "IMG_*", replace: "*" }, 0)).toBe("001.png");
    expect(applyBatchRename("IMG_001.png", { find: "IMG_*", replace: "photo-*" }, 0)).toBe("photo-001.png");
  });

  it("wildcard leaves names unchanged when no match", () => {
    expect(applyBatchRename("Button.tsx", { find: "IMG_*", replace: "*" }, 0)).toBe("Button.tsx");
  });

  it("wildcard supports multiple * positionally", () => {
    expect(applyBatchRename("a_b_c", { find: "*_*", replace: "*-*" }, 0)).toBe("a_b-c");
  });

  it("wildcard does not corrupt the extension", () => {
    expect(applyBatchRename("data.csv", { find: "*", replace: "backup-*" }, 0)).toBe("backup-data.csv");
  });

  it("wildcard escapes regex meta in the non-wildcard parts", () => {
    expect(applyBatchRename("file[1].txt", { find: "file[*]", replace: "x" }, 0)).toBe("x.txt");
  });

  it("wildcard leaves literal $ in replace untouched", () => {
    expect(applyBatchRename("Button.tsx", { find: "*", replace: "cost $1" }, 0)).toBe("cost $1");
  });

});
