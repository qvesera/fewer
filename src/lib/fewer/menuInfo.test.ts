import { describe, expect, test } from "bun:test";
import {
  canvasMenuHeader,
  edgeMenuHeader,
  fullNodeLabel,
  nodeInfoRows,
  nodeMenuHeader,
  selectionCounts,
  selectionMenuHeader,
  sourceLabel,
} from "./menuInfo";
import type { FewerNode } from "./types";

type Data = Partial<FewerNode["data"]> & { label: string; path: string; type: "folder" | "file" };

const node = (id: string, data: Data): FewerNode =>
  ({ id, data: data as FewerNode["data"], position: { x: 0, y: 0 } }) as FewerNode;

const folder = (label = "hooks", path = "fewer/src/hooks") =>
  node("f1", { label, path, type: "folder" });

const file = (extra: Partial<Data> = {}) =>
  node("n1", {
    label: "tailwind.config",
    path: "fewer/tailwind.config.js",
    type: "file",
    extension: "js",
    category: "config",
    size: 1100,
    ...extra,
  });

describe("nodeMenuHeader", () => {
  test("folder: name, then path underneath", () => {
    expect(nodeMenuHeader(folder())).toEqual({
      title: "hooks",
      subtitle: "fewer/src/hooks",
    });
  });

  test("file: extension is reassembled into the title", () => {
    expect(nodeMenuHeader(file()).title).toBe("tailwind.config.js");
  });

  test("a root card whose path equals its name has no subtitle", () => {
    expect(nodeMenuHeader(folder("fewer", "fewer")).subtitle).toBeUndefined();
  });
});

describe("selectionMenuHeader", () => {
  test("count plus a type breakdown", () => {
    expect(
      selectionCounts([folder(), file(), node("n2", { label: "a.ts", path: "a.ts", type: "file" })], [
        "f1",
        "n1",
        "n2",
      ]),
    ).toEqual({ selected: 3, folders: 1, files: 2 });
    expect(
      selectionMenuHeader({ selected: 3, folders: 1, files: 2 }),
    ).toEqual({ title: "3 items selected", subtitle: "1 folder · 2 files" });
  });

  test("unknown ids are counted as selected but as neither type", () => {
    expect(selectionCounts([folder()], ["f1", "ghost"])).toEqual({
      selected: 2,
      folders: 1,
      files: 0,
    });
    expect(selectionMenuHeader({ selected: 1, folders: 0, files: 0 }).subtitle).toBeUndefined();
  });
});

describe("edgeMenuHeader / canvasMenuHeader", () => {
  test("an edge names both ends", () => {
    const nodes = [
      node("p", { label: "src", path: "src", type: "folder" }),
      node("c", { label: "index", path: "src/index.ts", type: "file", extension: "ts" }),
    ];
    expect(edgeMenuHeader({ source: "p", target: "c" }, nodes)).toEqual({
      title: "Connection",
      subtitle: "src → index.ts",
    });
  });

  test("a dangling edge keeps its title and drops the subtitle", () => {
    expect(edgeMenuHeader({ source: "p", target: "gone" }, [])).toEqual({
      title: "Connection",
      subtitle: undefined,
    });
  });

  test("the canvas header counts cards and hidden cards", () => {
    expect(canvasMenuHeader({ nodeCount: 10 })).toEqual({ title: "Canvas", subtitle: "10 cards" });
    expect(canvasMenuHeader({ nodeCount: 1, hiddenCount: 2 }).subtitle).toBe("1 card · 2 hidden");
  });
});

// The regression this whole rework exists for: the old "Info" submenu was a set
// of conditional ACTIONS, so a folder from a repo/URL import (no webUrl, no disk
// path, no symlink) opened completely empty. Type + Path are unconditional now.
describe("nodeInfoRows", () => {
  test("a folder on a URL import still has rows — never an empty submenu", () => {
    const rows = nodeInfoRows({
      node: folder(),
      dataSource: "url:https://github.com/qvesera/fewer",
      folderCount: 2,
      fileCount: 5,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.value]));
    expect(byId.type).toBe("Folder");
    expect(byId.path).toBe("fewer/src/hooks");
    expect(byId.contents).toBe("2 folders · 5 files");
    expect(byId.source).toBe("GitHub");
    expect(byId.tags).toBe("None");
    // No size row for a folder whose total is unknown (formatSize(0) === "").
    expect(byId.size).toBeUndefined();
  });

  test("a file row set: type, path, size, source, tags", () => {
    const rows = nodeInfoRows({
      node: file(),
      dataSource: "directory",
      tagLabels: ["ui", "bug"],
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.value]));
    expect(byId.type).toBe("File · .js · config");
    expect(byId.size).toBe("1.1 KB");
    expect(byId.source).toBe("Local disk");
    expect(byId.tags).toBe("ui, bug");
    expect(byId.contents).toBeUndefined();
  });

  test("flags and symlink targets are reported, not hidden", () => {
    const rows = nodeInfoRows({
      node: node("f2", {
        label: "v012",
        path: "fewer/v012",
        type: "folder",
        isRoot: true,
        isArchive: true,
        symlink: { target: "../v012", broken: true },
      }),
      childCount: 4,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.value]));
    expect(byId.type).toBe("Folder · root · archive · symlink");
    expect(byId.contents).toBe("4 items");
    expect(byId.link).toBe("⚠ broken → v012");
  });
});

describe("sourceLabel / fullNodeLabel", () => {
  test("synthetic origins do not read as \"Provider\"", () => {
    expect(sourceLabel(null)).toBe("This canvas");
    expect(sourceLabel("directory")).toBe("Local disk");
    expect(sourceLabel("file")).toBe("Imported file");
    expect(sourceLabel("shared")).toBe("Shared link");
    expect(sourceLabel("saved")).toBe("Saved graph");
    expect(sourceLabel("cloud:onedrive")).toBe("OneDrive");
    expect(sourceLabel("url:https://example.org/files/")).toBe("example.org");
  });

  test("fullNodeLabel only appends a real extension", () => {
    expect(fullNodeLabel(file())).toBe("tailwind.config.js");
    expect(fullNodeLabel(folder())).toBe("hooks");
  });
});
