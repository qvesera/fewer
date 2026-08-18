import { test, expect } from "bun:test";
import { parseASCIITree } from "./parsers";
import { FEWER_CREDIT, TREE_HEADER } from "./branding";

test("parses an exported directory tree, ignoring header + credit + summary", () => {
  const text = [
    TREE_HEADER,
    "",
    "fewer/",
    "├── public/",
    "│   └── logo",
    "└── src/",
    "    └── App.view",
    "",
    "3 directories, 2 files",
    "",
    FEWER_CREDIT,
    "",
  ].join("\n");

  const tree = parseASCIITree(text);
  expect(tree.name).toBe("fewer");
  expect(tree.type).toBe("folder");
  // two children: public/, src/
  expect(tree.children?.length).toBe(2);
  // no phantom "Directory Tree Structure", summary, or credit node
  const names: string[] = [];
  const walk = (e: { name: string; children?: unknown[] }) => {
    names.push(e.name);
    e.children?.forEach((c) => walk(c as { name: string; children?: unknown[] }));
  };
  walk(tree);
  expect(names).not.toContain(TREE_HEADER);
  expect(names).not.toContain("3 directories, 2 files");
  expect(names.some((n) => n.toLowerCase().includes("created with fewer"))).toBe(false);
});

test("header is branded as root when it is the first line", () => {
  const tree = parseASCIITree(`${TREE_HEADER}\n\nsrc/\n`);
  expect(tree.name).toBe("src");
  expect(tree.children?.length).toBe(0);
});

test("bare tree with no header still parses", () => {
  const tree = parseASCIITree("src/\n├── main.ts\n└── App.view");
  expect(tree.name).toBe("src");
  expect(tree.children?.length).toBe(2);
});