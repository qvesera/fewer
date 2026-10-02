import { describe, expect, test } from "bun:test";
import { buildCsvExport, buildDotExport, buildJsonExport } from "./exportUtils";
import { detectImportFormat } from "./importDetect";
import { parseCSVGraph, parseDOTGraph, parseJSONGraph } from "./parsers";
import { APP_VERSION, FEWER_CREDIT } from "./branding";
import type { FewerEdge, FewerNode } from "./types";

const node = (id: string): FewerNode =>
  ({
    id,
    type: "folder",
    position: { x: 0, y: 0 },
    data: { label: id, path: `/${id}`, type: "folder" },
  }) as unknown as FewerNode;

/** One fixture graph: a folder, a file with an extension, and a symlink. */
const fixture = () => {
  const make = (
    id: string,
    type: "folder" | "file",
    label: string,
    path: string,
    extra: Partial<FewerNode["data"]> = {},
  ): FewerNode =>
    ({
      id,
      type,
      position: { x: 0, y: 0 },
      data: { label, path, type, ...extra },
    }) as unknown as FewerNode;

  const nodes: FewerNode[] = [
    make("r", "folder", "show", "show"),
    make("a", "folder", "assets", "show/assets"),
    make("b", "file", "logo", "show/assets/logo.png", { extension: "png", category: "image", size: 2048 }),
    make("c", "folder", "latest", "show/latest", {
      symlink: { target: "v012", followed: false },
    }),
    make("d", "folder", "v012", "show/v012"),
  ];
  const edges = (["r>a", "a>b", "r>c", "r>d"] as const).map((pair) => {
    const [source, target] = pair.split(">");
    return { id: `e-${pair}`, source, target, type: "default" } as unknown as FewerEdge;
  });
  return { nodes, edges };
};

/** Flatten a TreeEntry to "path:type" strings for shape comparison. */
function flatten(entry: { name: string; type: string; symlink?: { target: string }; children?: unknown[] }, prefix = ""): string[] {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  const self = `${path}:${entry.type}${entry.symlink ? `->${entry.symlink.target}` : ""}`;
  const kids = (entry.children ?? []).flatMap((c) =>
    flatten(c as Parameters<typeof flatten>[0], path),
  );
  return [self, ...kids];
}

describe("CSV / DOT round-trip", () => {
  test("buildCsvExport → parseCSVGraph preserves the whole tree", () => {
    const { nodes, edges } = fixture();
    const tree = parseCSVGraph(buildCsvExport(nodes, edges));
    expect(flatten(tree)).toEqual([
      "show:folder",
      "show/assets:folder",
      "show/assets/logo.png:file",
      "show/latest:folder->v012",
      "show/v012:folder",
    ]);
  });

  test("buildDotExport → parseDOTGraph preserves the whole tree", () => {
    const { nodes, edges } = fixture();
    const tree = parseDOTGraph(buildDotExport(nodes, edges));
    expect(flatten(tree)).toEqual([
      "show:folder",
      "show/assets:folder",
      "show/assets/logo.png:file",
      "show/latest:folder->v012",
      "show/v012:folder",
    ]);
  });

  test("JSON round-trip keeps extensions and symlink targets", () => {
    const { nodes, edges } = fixture();
    const tree = parseJSONGraph(JSON.stringify(buildJsonExport(nodes, edges)));
    expect(flatten(tree)).toEqual([
      "show:folder",
      "show/assets:folder",
      "show/assets/logo.png:file",
      "show/latest:folder->v012",
      "show/v012:folder",
    ]);
  });
});

describe("detection recognises every exported payload", () => {
  // What we write must be what the detector sees — otherwise a re-import would
  // parse our own export with the wrong parser. (Tree and script exports are
  // excluded because they call downloadBlob internally and are not pure; their
  // shapes are pinned in importDetect.test.ts.)
  test("json export → json", () => {
    const { nodes, edges } = fixture();
    expect(detectImportFormat(JSON.stringify(buildJsonExport(nodes, edges)))).toBe("json");
  });

  test("csv export → csv", () => {
    const { nodes, edges } = fixture();
    expect(detectImportFormat(buildCsvExport(nodes, edges))).toBe("csv");
  });

  test("dot export → dot", () => {
    const { nodes, edges } = fixture();
    expect(detectImportFormat(buildDotExport(nodes, edges))).toBe("dot");
  });

  test("and each detected payload still parses back to the same tree", () => {
    const { nodes, edges } = fixture();
    const expected = [
      "show:folder",
      "show/assets:folder",
      "show/assets/logo.png:file",
      "show/latest:folder->v012",
      "show/v012:folder",
    ];
    for (const [payload, parse] of [
      [JSON.stringify(buildJsonExport(nodes, edges)), parseJSONGraph],
      [buildCsvExport(nodes, edges), parseCSVGraph],
      [buildDotExport(nodes, edges), parseDOTGraph],
    ] as const) {
      expect(flatten(parse(payload))).toEqual(expected);
    }
  });
});

function meta(includeBranding = true): Record<string, unknown> {
  return buildJsonExport([node("a")], [], undefined, includeBranding)
    .meta as Record<string, unknown>;
}

describe("buildJsonExport meta", () => {
  test("stamps APP_VERSION, not a hardcoded literal", () => {
    expect(meta().version).toBe(APP_VERSION);
    expect(meta().version).not.toBe("1.0.0");
  });

  test("identifies the application", () => {
    expect(meta().application).toBe("fewer");
  });

  test("appends the shared credit line when branding enabled", () => {
    expect(meta().generatedBy).toBe(FEWER_CREDIT);
  });

  test("omits generatedBy when branding disabled", () => {
    expect(meta(false).generatedBy).toBeUndefined();
  });

  test("carries exportedAt, stats and mapped nodes", () => {
    const out = buildJsonExport([node("a")], []);
    expect(typeof (out.meta as Record<string, unknown>).exportedAt).toBe("string");
    expect(out.stats).toBeNull();
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });
});
