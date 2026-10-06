import { test, expect, describe } from "bun:test";
import { parseASCIITree, parseCSVGraph, parseDOTGraph, parseImportFile, parseJSONGraph } from "./parsers";
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

test("JSON round-trip keeps file extensions (basename beats the stripped label)", () => {
  const exported = {
    nodes: [
      { id: "r", label: "show", path: "show", type: "folder" },
      { id: "a", label: "App", path: "show/App.tsx", type: "file", extension: "tsx" },
    ],
    edges: [{ id: "e1", source: "r", target: "a" }],
  };
  const tree = parseJSONGraph(JSON.stringify(exported));
  expect(tree.children!.find((c) => c.name === "App.tsx")!.type).toBe("file");
});

test("parseJSONGraph unwraps a .fwr envelope ({format_version, app, graph})", () => {
  // T-101: the desktop library + exportFWR write .fwr documents; the same
  // JSON importer must accept them without a separate format.
  const envelope = {
    format_version: 1,
    app: "fewer",
    graph: {
      id: "fwr_x",
      name: "fewer-x",
      data: {
        nodes: [
          { id: "r", label: "proj", path: "proj", type: "folder" },
          { id: "a", label: "App.tsx", path: "proj/App.tsx", type: "file", extension: "tsx" },
        ],
        edges: [{ id: "e1", source: "r", target: "a" }],
      },
    },
  };
  const tree = parseJSONGraph(JSON.stringify(envelope));
  expect(tree.children!.find((c) => c.name === "App.tsx")!.type).toBe("file");
});

describe("parseCSVGraph — our own export format", () => {
  const csv = [
    "id,label,path,type,extension,category,size_bytes,symlink_target",
    "r,show,show,folder,,,0,",
    "a,App,show/App.tsx,file,tsx,code,1024,",
    "b,assets,show/assets,folder,,,0,",
    "c,logo,show/assets/logo.png,file,png,image,2048,v012",
    "",
    "# edges",
    "id,source,target",
    "e1,r,a",
    "e2,r,b",
    "e3,b,c",
    "# Created with fewer — https://fewer.direct",
  ].join("\n");

  test("parses nodes + edges into a tree, ignoring the credit line", () => {
    const tree = parseCSVGraph(csv);
    expect(tree.name).toBe("show");
    const names = tree.children!.map((c) => c.name).sort();
    expect(names).toEqual(["App.tsx", "assets"]);
    expect(
      tree.children!.find((c) => c.name === "assets")!.children!.map((c) => c.name),
    ).toEqual(["logo.png"]);
  });

  test("carries the symlink target column back onto the node", () => {
    const tree = parseCSVGraph(csv);
    const logo = tree.children!.find((c) => c.name === "assets")!.children![0]!;
    expect(logo.symlink).toMatchObject({ target: "v012", followed: false });
  });

  test("quoted fields survive: commas, doubled quotes, embedded newlines", () => {
    const quoted = [
      "id,label,path,type,extension,category,size_bytes,symlink_target",
      "r,show,show,folder,,,0,",
      'a,"App, the app","show/App.tsx",file,tsx,code,1024,',
      'b,"Say ""hi""",show/b.txt,file,txt,code,1,',
      'c,"multi\nline",show/c.txt,file,txt,code,1,',
      "",
      "# edges",
      "id,source,target",
      "e1,r,a",
      "e2,r,b",
      "e3,r,c",
    ].join("\n");
    const names = parseCSVGraph(quoted).children!.map((c) => c.name);
    // Names come from each row's `path` basename — if quoting had broken, the
    // comma inside `"App, the app"` would have shifted every later column and
    // these paths (and their extensions) would not survive intact.
    expect(names).toContain("App.tsx");
    expect(names).toContain("b.txt");
    expect(names).toContain("c.txt");
  });

  test("errors loudly on an empty file and on multiple roots", () => {
    expect(() => parseCSVGraph("")).toThrow("No CSV rows found");
    const twoRoots = [
      "id,label,path,type,extension,category,size_bytes,symlink_target",
      "a,one,one,folder,,,0,",
      "b,two,two,folder,,,0,",
    ].join("\n");
    expect(() => parseCSVGraph(twoRoots)).toThrow("one root");
  });
});

describe("parseCSVGraph — foreign CSV via column mapping", () => {
  const map = {
    name: 1,
    path: -1,
    type: 2,
    extension: -1,
    symlinkTarget: -1,
    parent: 0,
  };

  test("builds the tree from a mapped parent column", () => {
    const csv = ["Parent,Filename,Kind", ",root,folder", "root,a.ts,file", "root,src,folder", "src,b.ts,file"].join(
      "\n",
    );
    const tree = parseCSVGraph(csv, map);
    expect(tree.name).toBe("root");
    expect(tree.children!.map((c) => c.name).sort()).toEqual(["a.ts", "src"]);
    expect(tree.children!.find((c) => c.name === "src")!.children!.map((c) => c.name)).toEqual([
      "b.ts",
    ]);
  });

  test("builds the tree from a mapped path column, creating folder prefixes", () => {
    const csv = ["full_path", "src/hooks/useX.ts", "src/App.tsx", "README.md"].join("\n");
    const tree = parseCSVGraph(csv, {
      name: -1,
      path: 0,
      type: -1,
      extension: -1,
      symlinkTarget: -1,
      parent: -1,
    });
    // First path segment becomes the root; prefixes become folders.
    expect(tree.name).toBe("src");
    const byName = (n: string) => tree.children!.find((c) => c.name === n)!;
    expect(byName("hooks").type).toBe("folder");
    expect(byName("hooks").children!.map((c) => c.name)).toEqual(["useX.ts"]);
    expect(byName("App.tsx").type).toBe("file");
  });

  test("a bare list of slash-separated names imports as paths", () => {
    const csv = ["things", "src/App.tsx", "src/main.ts"].join("\n");
    // No header aliases match — the single-column fallback maps it to name.
    const tree = parseCSVGraph(csv);
    expect(tree.name).toBe("src");
    expect(tree.children!.map((c) => c.name).sort()).toEqual(["App.tsx", "main.ts"]);
  });

  test("flat rows with no hierarchy become one root with file children", () => {
    const csv = ["name", "a.ts", "b.ts"].join("\n");
    const tree = parseCSVGraph(csv);
    // Single column: nothing contains "/", so rows are flat — first row names the root.
    expect(tree.name).toBe("a.ts");
  });

  test("errors when no name column can be found", () => {
    const csv = ["col_a,col_b", "1,2"].join("\n");
    // Two columns, no aliases match, no fallback → the parser refuses.
    expect(() => parseCSVGraph(csv)).toThrow("No name column");
  });
});

describe("parseDOTGraph", () => {
  test("parses our own export shape: labels, extensions, dashed symlink edges", () => {
    const dot = [
      "digraph fewer {",
      '  graph [rankdir="TB", bgcolor="transparent"];',
      '  node [shape=box, style="rounded,filled", fontname="sans-serif"];',
      '  "r" [label="show\\nfolder", fillcolor="#f97316", fontcolor="white"];',
      '  "a" [label="App\\n.tsx", fillcolor="#a855f7", fontcolor="white"];',
      '  "b" [label="v012\\nfolder", fillcolor="#f97316", fontcolor="white"];',
      '  "c" [label="latest\\nfolder\\n↷ v012", fillcolor="#f97316", fontcolor="white", symlink="v012", style="rounded,filled,dashed"];',
      '  "r" -> "a";',
      '  "r" -> "b";',
      '  "r" -> "c" [style=dashed];',
      "  // Created with fewer — https://fewer.direct",
      "}",
    ].join("\n");
    const tree = parseDOTGraph(dot);
    expect(tree.name).toBe("show");
    expect(tree.children!.map((c) => c.name).sort()).toEqual(["App.tsx", "latest", "v012"]);
    const latest = tree.children!.find((c) => c.name === "latest")!;
    expect(latest.symlink).toMatchObject({ target: "v012", followed: false });
  });

  test("third-party DOT: folder = node with children, file = leaf", () => {
    const tree = parseDOTGraph("digraph G {\n  a -> b;\n  a -> c;\n}");
    expect(tree.name).toBe("a");
    expect(tree.type).toBe("folder");
    expect(tree.children!.map((c) => c.name).sort()).toEqual(["b", "c"]);
  });

  test("undirected -- edges count as containment, comments are stripped", () => {
    const dot = [
      "# a header comment",
      "/* block",
      "   comment */",
      "graph demo {",
      "  a -- b  // trailing comment",
      "}",
    ].join("\n");
    const tree = parseDOTGraph(dot);
    expect(tree.name).toBe("a");
    expect(tree.children!.map((c) => c.name)).toEqual(["b"]);
  });

  test("multi-line attribute lists and quoted ids parse", () => {
    const dot = [
      'digraph "my graph" {',
      '  "node 1" [',
      '    label = "Hello',
      '    World",',
      "    color = red",
      "  ];",
      '  "node 2" [label="child"];',
      '  "node 1" -> "node 2";',
      "}",
    ].join("\n");
    const tree = parseDOTGraph(dot);
    // The label is the display name in DOT — it wins over the opaque id, and a
    // wrapped multi-line label keeps all of its lines.
    expect(tree.name).toBe("Hello World");
    expect(tree.children!.map((c) => c.name)).toEqual(["child"]);
  });

  test("errors on an empty document", () => {
    expect(() => parseDOTGraph("")).toThrow("No nodes found");
    expect(() => parseDOTGraph("digraph x { /* nothing */ }")).toThrow("No nodes found");
  });
});

describe("parseImportFile dispatch", () => {
  test("routes csv and dot to the new parsers", () => {
    expect(parseImportFile("name\na.ts", "csv").name).toBe("a.ts");
    expect(parseImportFile("digraph { a -> b }", "dot").name).toBe("a");
  });
});