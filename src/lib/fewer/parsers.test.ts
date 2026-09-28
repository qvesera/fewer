import { test, expect } from "bun:test";
import { parseASCIITree, parseJSONGraph } from "./parsers";
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

test("ASCII tree: 'name -> target' lines parse as symlinks (folder keeps its slash typing)", () => {
  const tree = parseASCIITree(
    ["show/", "├── v012/", "│   └── shot.exr", "├── latest/ -> v012", "├── readme.txt -> v012/shot.exr", "└── dangling -> nowhere"].join("\n"),
  );
  const byName = (n: string) => tree.children!.find((c) => c.name === n)!;
  expect(tree.children!.length).toBe(4);

  const latest = byName("latest");
  expect(latest.type).toBe("folder"); // trailing "/" survived the arrow split
  expect(latest.symlink).toMatchObject({ target: "v012", followed: false });

  const readme = byName("readme.txt");
  expect(readme.type).toBe("file"); // no children + no slash → file link
  expect(readme.symlink?.target).toBe("v012/shot.exr");

  const dangling = byName("dangling");
  expect(dangling.symlink?.target).toBe("nowhere");

  // Non-link entries carry no symlink field.
  expect(byName("v012").symlink).toBeUndefined();
});

test("JSON round-trip: symlink metadata survives export → parse", () => {
  const exported = {
    nodes: [
      { id: "r", label: "show", path: "show", type: "folder" },
      { id: "a", label: "v012", path: "show/v012", type: "folder" },
      {
        id: "b", label: "latest", path: "show/latest", type: "folder",
        symlink: { target: "v012", resolvedPath: "/show/v012", insideTree: true, followed: false },
      },
    ],
    edges: [
      { id: "e1", source: "r", target: "a" },
      { id: "e2", source: "r", target: "b" },
    ],
  };
  const tree = parseJSONGraph(JSON.stringify(exported));
  const latest = tree.children!.find((c) => c.name === "latest")!;
  expect(latest.symlink).toMatchObject({ target: "v012", insideTree: true });
  expect(tree.children!.find((c) => c.name === "v012")!.symlink).toBeUndefined();
});