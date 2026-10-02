import { describe, expect, test } from "bun:test";
import { detectImportFormat } from "./importDetect";

const JSON_GRAPH = `{
  "meta": { "application": "fewer" },
  "nodes": [{ "id": "r", "label": "show", "path": "show", "type": "folder" }],
  "edges": []
}`;

const DOT = `digraph fewer {
  "r" [label="show\\nfolder", fillcolor="#f97316"];
  "a" [label="App\\n.tsx", fillcolor="#a855f7"];
  "r" -> "a";
}`;

const SCRIPT = `mkdir -p "src/components"
mkdir -p "src/hooks"`;

const CSV_TABLE = `id,label,path,type
r,show,show,folder
a,App,show/App.tsx,file`;

const ASCII_TREE = `show/
├── src/
│   └── App.tsx
└── package.json`;

describe("detectImportFormat — each format from its own shape", () => {
  test("json", () => expect(detectImportFormat(JSON_GRAPH)).toBe("json"));
  test("dot", () => expect(detectImportFormat(DOT)).toBe("dot"));
  test("script", () => expect(detectImportFormat(SCRIPT)).toBe("script"));
  test("csv table", () => expect(detectImportFormat(CSV_TABLE)).toBe("csv"));
  test("ascii tree", () => expect(detectImportFormat(ASCII_TREE)).toBe("tree"));

  test("our own CSV export header counts even on a single row", () => {
    const header =
      "id,label,path,type,extension,category,size_bytes,symlink_target";
    expect(detectImportFormat(header)).toBe("csv");
  });

  test("a DOT document with the header commented out still detects", () => {
    expect(detectImportFormat(`// layout: dot\n${DOT}`)).toBe("dot");
  });
});

describe("detectImportFormat — the ties that matter", () => {
  test("json that parses but is not a graph falls through", () => {
    expect(detectImportFormat(`{ "foo": 1, "bar": 2 }`)).toBe("tree");
  });

  test("a graph declaration with no edge is not DOT", () => {
    expect(detectImportFormat(`graph theory {\n  a\n}`)).toBe("tree");
  });

  test("a mkdir line with a quoted comma is a script, not a CSV", () => {
    const script = `mkdir -p "a,b"\nmkdir -p "src"`;
    expect(detectImportFormat(script)).toBe("script");
  });

  test("a comma in a tree name does not turn an ASCII tree into a CSV", () => {
    const tree = `show,\n├── a, b.txt\n└── c.txt`;
    expect(detectImportFormat(tree)).toBe("tree");
  });

  test("a single-column list has no delimiter, so it stays a tree", () => {
    expect(detectImportFormat("name\na.ts\nb.ts")).toBe("tree");
  });

  test("a 2-row single-column CSV is not a table", () => {
    expect(detectImportFormat("name\na.ts")).toBe("tree");
  });

  test("a ragged delimited table is still a table", () => {
    expect(detectImportFormat("a,b,\n,c,,d")).toBe("csv");
  });
});

describe("detectImportFormat — totality", () => {
  test("empty and whitespace-only content is a tree", () => {
    expect(detectImportFormat("")).toBe("tree");
    expect(detectImportFormat("   \n\t  ")).toBe("tree");
  });

  test("prose with no structure is a tree", () => {
    expect(detectImportFormat("just some notes about a folder")).toBe("tree");
  });

  test("keywords are matched case-insensitively", () => {
    expect(detectImportFormat("DIGRAPH G {\n  a -> b;\n}")).toBe("dot");
    expect(detectImportFormat("MKDIR -p src")).toBe("script");
  });

  test("a bare mkdir word still routes to the script parser", () => {
    // Detection chooses a parser; an incomplete command is an honest parse
    // error ("No mkdir commands found"), not a reason to guess tree.
    expect(detectImportFormat("mkdir")).toBe("script");
  });

  test("never throws on awkward input", () => {
    const awkward = [
      "{",
      "[",
      "{ \"nodes\": ",
      "digraph",
      "digraph {",
      '"unterminated',
      "├── └── │",
      "\u0000\u0001binary-ish",
    ];
    for (const input of awkward) {
      expect(() => detectImportFormat(input)).not.toThrow();
    }
  });

  test("awkward input with no structure still resolves to a tree", () => {
    const awkward = ["{", "[", "{ \"nodes\": ", "digraph", "digraph {", '"unterminated'];
    for (const input of awkward) {
      expect(detectImportFormat(input)).toBe("tree");
    }
  });
});
