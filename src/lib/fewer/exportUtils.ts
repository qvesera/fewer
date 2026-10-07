import type {
  FewerNode,
  FewerEdge,
  ExportSettings,
  DirectoryStats,
  LayoutDirection,
} from "./types";
import {
  buildGraphSVG,
  readThemePalette,
  readBodyFont,
  readDashOffset,
  type GraphRenderOptions,
} from "./graphRenderer";
import type { Tag } from "./tags";
import { APP_VERSION, FEWER_CREDIT } from "./branding";
  
function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}`;
}

/**
 * Extra image-export options passed from the ExportPanel so the renderer can
 * mirror the live canvas (hidden nodes, per-view positions, collapsed folders,
 * tags, edge + node settings).
 */
export interface ImageExportOptions {
  selectedIds?: string[];
  hiddenIds?: string[];
  nodeWidth?: number;
  nodeHeight?: number;
  edgeWidth?: number;
  cornerRadius?: number;
  /** Folder ids the active view renders as a collapsed pill. */
  collapsedIds?: Set<string>;
  /** Tag registry — exported rings/dots use the same colors as the canvas. */
  tags?: Tag[];
  /** Layout direction of the active view — edges anchor to it, as on canvas. */
  direction?: LayoutDirection;
}

/** Fold the shared image options into the renderer's option bag. */
function imageRenderOptions(
  settings: ExportSettings,
  opts: ImageExportOptions,
): GraphRenderOptions {
  return {
    palette: readThemePalette(),
    fontFamily: readBodyFont(),
    selectedIds: new Set(opts.selectedIds ?? []),
    hiddenIds: opts.hiddenIds?.length ? new Set(opts.hiddenIds) : undefined,
    transparentBackground: settings.transparentBackground,
    includeBranding: settings.includeBranding,
    nodeWidth: opts.nodeWidth,
    nodeHeight: opts.nodeHeight,
    defaultEdgeWidth: opts.edgeWidth,
    cornerRadius: opts.cornerRadius,
    dashOffset: readDashOffset(),
    collapsedIds: opts.collapsedIds?.size ? opts.collapsedIds : undefined,
    tags: opts.tags,
    direction: opts.direction,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  SVG                                       */
/* -------------------------------------------------------------------------- */

export function exportSVG(
  nodes: FewerNode[],
  edges: FewerEdge[],
  settings: ExportSettings,
  opts: ImageExportOptions = {},
) {
  if (nodes.length === 0) return;
  const { svg, width } = buildGraphSVG(nodes, edges, imageRenderOptions(settings, opts));
  if (width === 0) return;
  downloadBlob(svg, `fewer-${timestamp()}.svg`, "image/svg+xml");
}

/* -------------------------------------------------------------------------- */
/*                                  PNG                                       */
/* -------------------------------------------------------------------------- */

export function exportPNG(
  nodes: FewerNode[],
  edges: FewerEdge[],
  settings: ExportSettings,
  opts: ImageExportOptions = {},
) {
  if (nodes.length === 0) return;
  const scene = buildGraphSVG(nodes, edges, imageRenderOptions(settings, opts));
  if (scene.width === 0 || scene.height === 0) return;

  const scale = Math.max(1, settings.quality / 50);
  const blobUrl = URL.createObjectURL(new Blob([scene.svg], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(scene.width * scale);
    canvas.height = Math.round(scene.height * scale);
    const ctx = canvas.getContext("2d");
    URL.revokeObjectURL(blobUrl);
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `fewer-${timestamp()}.png`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "image/png",
      settings.quality / 100,
    );
  };
  img.onerror = () => URL.revokeObjectURL(blobUrl);
  img.src = blobUrl;
}

/* -------------------------------------------------------------------------- */
/*                                  JSON                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build the JSON export payload. Pure — `exportJSON` downloads it, tests and
 * any future importer can read it without touching the DOM.
 */
export function buildJsonExport(
  nodes: FewerNode[],
  edges: FewerEdge[],
  stats?: DirectoryStats,
  includeBranding = true,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    application: "fewer",
    version: APP_VERSION,
  };
  if (includeBranding) meta.generatedBy = FEWER_CREDIT;
  return {
    meta,
    stats: stats ?? null,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      path: n.data.path,
      type: n.data.type,
      extension: n.data.extension ?? "",
      category: n.data.category ?? null,
      size: n.data.size ?? 0,
      position: n.position,
      ...(n.data.symlink ? { symlink: n.data.symlink } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  };
}

export function exportJSON(
  nodes: FewerNode[],
  edges: FewerEdge[],
  stats?: DirectoryStats,
  includeBranding = true,
) {
  downloadBlob(
    JSON.stringify(buildJsonExport(nodes, edges, stats, includeBranding), null, 2),
    `fewer-${timestamp()}.json`,
    "application/json",
  );
}

/**
 * Fewer graph document (.fwr, T-101): the portable saved-graph format —
 * `{ format_version, app, graph }` — importable by the desktop library, the
 * file import (json parser unwraps envelopes), and the web alike.
 */
export function exportFWR(
  nodes: FewerNode[],
  edges: FewerEdge[],
  stats?: DirectoryStats,
  includeBranding = true,
) {
  const now = new Date().toISOString();
  const doc = {
    format_version: 1,
    app: "fewer",
    graph: {
      id: `fwr_${Date.now().toString(36)}`,
      name: `fewer-${timestamp()}`,
      data: buildJsonExport(nodes, edges, stats, includeBranding),
      created_at: now,
      updated_at: now,
      share: null,
    },
  };
  downloadBlob(JSON.stringify(doc, null, 2), `fewer-${timestamp()}.fwr`, "application/json");
}

/* -------------------------------------------------------------------------- */
/*                                  CSV                                       */
/* -------------------------------------------------------------------------- */

/**
 * Format literals of the CSV export. The importer (`parsers.ts` +
 * `csvModel.ts`) duplicates them because parsers must not import this module —
 * it drags the DOM-backed graph renderer into the startup path. The round-trip
 * test in `exportUtils.test.ts` is the drift detector: exporter and importer
 * must agree on every one of these.
 */
const CSV_NODE_HEADER = "id,label,path,type,extension,category,size_bytes,symlink_target";
const CSV_EDGES_MARKER = "# edges";
const CSV_EDGES_HEADER = "id,source,target";

/**
 * Build the CSV export payload. Pure — `exportCSV` downloads it, tests and the
 * CSV importer (`parsers.parseCSVGraph`) read exactly these bytes.
 */
export function buildCsvExport(
  nodes: FewerNode[],
  edges: FewerEdge[],
  includeBranding = true,
): string {
  const lines: string[] = [];
  lines.push(CSV_NODE_HEADER);
  for (const n of nodes) {
    const row = [
      n.id,
      csvEscape(n.data.label),
      csvEscape(n.data.path),
      n.data.type,
      n.data.extension ?? "",
      n.data.category ?? "",
      String(n.data.size ?? 0),
      csvEscape(n.data.symlink?.target ?? ""),
    ];
    lines.push(row.join(","));
  }
  lines.push("");
  lines.push(CSV_EDGES_MARKER);
  lines.push(CSV_EDGES_HEADER);
  for (const e of edges) {
    lines.push([e.id, e.source, e.target].join(","));
  }
  if (includeBranding) lines.push(`# ${FEWER_CREDIT}`);
  return lines.join("\n");
}

export function exportCSV(
  nodes: FewerNode[],
  edges: FewerEdge[],
  includeBranding = true,
) {
  downloadBlob(buildCsvExport(nodes, edges, includeBranding), `fewer-${timestamp()}.csv`, "text/csv");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/*                                  DOT                                       */
/* -------------------------------------------------------------------------- */

/**
 * Marker the exporter uses for "link edge" — the DOT importer reads the same
 * token back as a symlink instead of containment (see the format-literal note
 * on the CSV constants above).
 */
const DOT_DASHED_EDGE_ATTR = "style=dashed";

/**
 * Build the DOT export payload. Pure — `exportDOT` downloads it, tests and the
 * DOT importer (`parsers.parseDOTGraph`) read exactly these bytes.
 */
export function buildDotExport(
  nodes: FewerNode[],
  edges: FewerEdge[],
  includeBranding = true,
): string {
  const lines: string[] = [];
  lines.push("digraph fewer {");
  lines.push('  graph [rankdir="TB", bgcolor="transparent"];');
  lines.push(
    '  node [shape=box, style="rounded,filled", fontname="sans-serif"];',
  );
  for (const n of nodes) {
    const fill = n.data.type === "folder" ? "#f97316" : "#a855f7";
    const label = `${n.data.label}\\n${n.data.extension ? "." + n.data.extension : n.data.type}${
      n.data.symlink ? `\\n↷ ${n.data.symlink.target}` : ""
    }`;
    // Symlink nodes: dashed border + the target in the label, so the exported
    // graph carries the same link signal the canvas does.
    const attrs = [`label="${label}"`, `fillcolor="${fill}"`, `fontcolor="white"`];
    if (n.data.symlink) {
      attrs.push(`symlink="${n.data.symlink.target}"`, 'style="rounded,filled,dashed"');
    }
    lines.push(`  "${n.id}" [${attrs.join(", ")}];`);
  }
  for (const e of edges) {
    // A link edge reads as "points at", not containment: dashed.
    const style = nodes.find((n) => n.id === e.target)?.data.symlink
      ? ` [${DOT_DASHED_EDGE_ATTR}]`
      : "";
    lines.push(`  "${e.source}" -> "${e.target}"${style};`);
  }
  if (includeBranding) lines.push(`  // ${FEWER_CREDIT}`);
  lines.push("}");
  return lines.join("\n");
}

export function exportDOT(
  nodes: FewerNode[],
  edges: FewerEdge[],
  includeBranding = true,
) {
  downloadBlob(buildDotExport(nodes, edges, includeBranding), `fewer-${timestamp()}.dot`, "text/plain");
}

/* -------------------------------------------------------------------------- */
/*                                Dispatcher                                   */
/* -------------------------------------------------------------------------- */

export function exportGraph(
  nodes: FewerNode[],
  edges: FewerEdge[],
  settings: ExportSettings,
  stats?: DirectoryStats,
  opts: ImageExportOptions = {},
) {
  switch (settings.format) {
    case "svg":
      return exportSVG(nodes, edges, settings, opts);
    case "png":
      return exportPNG(nodes, edges, settings, opts);
    case "json":
      return exportJSON(nodes, edges, stats, settings.includeBranding);
    case "fwr":
      return exportFWR(nodes, edges, stats, settings.includeBranding);
    case "csv":
      return exportCSV(nodes, edges, settings.includeBranding);
    case "dot":
      return exportDOT(nodes, edges, settings.includeBranding);
  }
}
