import { describe, expect, test } from "bun:test";
import { DEFAULT_IMPORT_OPTIONS, type ImportOptions } from "./importOptions";
import { continueScan, scanSkeleton, type ScanBatch } from "./progressiveScan";
import { groupedScanSource, groupFilesForScan } from "./webProgressive";

// T-208: the webkitdirectory fallback is a flat FileList — grouping it into
// per-directory listings is the whole adapter, so it gets pinned hard.

const FILES = [
  { relativePath: "app/src/a.ts", size: 10 },
  { relativePath: "app/src/lib/b.ts", size: 20 },
  { relativePath: "app/README.md", size: 5 },
  { relativePath: "app/docs/guide/intro.md", size: 7 },
];

describe("groupFilesForScan", () => {
  test("derives folders from file paths, with sizes", () => {
    const grouped = groupFilesForScan(FILES)!;
    expect(grouped.rootName).toBe("app");
    const root = grouped.dirs.get("app")!;
    expect(root.map((e) => `${e.name}:${e.type}`).sort()).toEqual(["README.md:file", "docs:folder", "src:folder"]);
    const src = grouped.dirs.get("app/src")!;
    expect(src.find((e) => e.name === "lib")?.type).toBe("folder");
    expect(grouped.dirs.get("app/src/lib")!).toEqual([{ name: "b.ts", type: "file", size: 20 }]);
    // Depth without files still registers every ancestor.
    expect(grouped.dirs.get("app/docs")!.some((e) => e.name === "guide")).toBe(true);
  });

  test("empty input is null", () => {
    expect(groupFilesForScan([])).toBeNull();
  });
});

describe("grouped source drives the progressive walker", () => {
  test("skeleton + background cover every directory of the grouped list", async () => {
    const source = groupedScanSource(groupFilesForScan(FILES)!);
    const opts: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS };
    const skeleton = await scanSkeleton(source.rootName, { options: opts, listAll: source.listAll }, 2);
    const skeletonParents = skeleton.batches.map((b) => b.parentPath).sort();
    expect(skeletonParents).toContain("");
    expect(skeletonParents).toContain("src");
    const batches: ScanBatch[] = [];
    const result = await continueScan(skeleton.queue, {
      options: opts,
      listAll: source.listAll,
      onBatch: (b) => batches.push(b),
    });
    expect(result.stopped).toBe(false);
    // Every directory in the fixture was visited exactly once across both phases.
    const all = new Set([...skeletonParents, ...batches.map((b) => b.parentPath)]);
    expect([...all].sort()).toEqual(["", "docs", "docs/guide", "src", "src/lib"]);
  });
});