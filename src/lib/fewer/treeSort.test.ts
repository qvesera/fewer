import { test, expect } from "bun:test";
import { sortFoldersFirst, sortTreeFoldersFirst } from "./treeSort";
import type { TreeEntry } from "./types";

const file = (name: string): TreeEntry => ({ name, type: "file" });
const folder = (name: string, children?: TreeEntry[]): TreeEntry => ({
  name,
  type: "folder",
  ...(children ? { children } : {}),
});

test("sortFoldersFirst puts folders first, then alphabetical", () => {
  const items = [file("b.txt"), folder("zeta"), file("a.txt"), folder("Alpha")];
  sortFoldersFirst(items);
  expect(items.map((i) => i.name)).toEqual(["Alpha", "zeta", "a.txt", "b.txt"]);
});

test("sortTreeFoldersFirst sorts every nesting level in place", () => {
  const tree = folder("root", [
    file("z.txt"),
    folder("sub", [file("b.txt"), folder("deep"), file("a.txt")]),
    folder("empty"),
  ]);

  sortTreeFoldersFirst(tree);

  expect(tree.children!.map((c) => c.name)).toEqual(["empty", "sub", "z.txt"]);
  expect(tree.children![1]!.children!.map((c) => c.name)).toEqual(["deep", "a.txt", "b.txt"]);
});

test("sortTreeFoldersFirst leaves a childless leaf untouched", () => {
  const leaf = file("single.txt");
  sortTreeFoldersFirst(leaf);
  expect(leaf.children).toBeUndefined();
});