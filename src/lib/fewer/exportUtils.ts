import type {
  FewerNode,
  FewerEdge,
  ExportSettings,
  DirectoryStats,
} from "./types";
import {
  buildGraphSVG,
  readThemePalette,
  readBodyFont,
  readDashOffset,
} from "./graphRenderer";
import { FEWER_CREDIT } from "./branding";
  
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
 * mirror the live canvas (selection, hidden nodes, edge + node settings).
 */
export interface ImageExportOptions {
  selectedIds?: string[];
  hiddenIds?: string[];
  nodeWidth?: number;
  nodeHeight?: number;
  edgeWidth?: number;
  cornerRadius?: number;
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
  const { svg, width } = buildGraphSVG(nodes, edges, {
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
  });
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
  const scene = buildGraphSVG(nodes, edges, {
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
  });
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

export function exportJSON(
  nodes: FewerNode[],
  edges: FewerEdge[],
  stats?: DirectoryStats,
  includeBranding = true,
) {
  const meta: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    application: "fewer",
    version: "1.0.0",
  };
  if (includeBranding) meta.generatedBy = FEWER_CREDIT;
  const payload = {
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
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  };
  downloadBlob(
    JSON.stringify(payload, null, 2),
    `fewer-${timestamp()}.json`,
    "application/json",
  );
}

/* -------------------------------------------------------------------------- */
/*                                  CSV                                       */
/* -------------------------------------------------------------------------- */

export function exportCSV(
  nodes: FewerNode[],
  edges: FewerEdge[],
  includeBranding = true,
) {
  const lines: string[] = [];
  lines.push("id,label,path,type,extension,category,size_bytes");
  for (const n of nodes) {
    const row = [
      n.id,
      csvEscape(n.data.label),
      csvEscape(n.data.path),
      n.data.type,
      n.data.extension ?? "",
      n.data.category ?? "",
      String(n.data.size ?? 0),
    ];
    lines.push(row.join(","));
  }
  lines.push("");
  lines.push("# edges");
  lines.push("id,source,target");
  for (const e of edges) {
    lines.push([e.id, e.source, e.target].join(","));
  }
  if (includeBranding) lines.push(`# ${FEWER_CREDIT}`);
  downloadBlob(lines.join("\n"), `fewer-${timestamp()}.csv`, "text/csv");
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

export function exportDOT(
  nodes: FewerNode[],
  edges: FewerEdge[],
  includeBranding = true,
) {
  const lines: string[] = [];
  lines.push("digraph fewer {");
  lines.push('  graph [rankdir="TB", bgcolor="transparent"];');
  lines.push(
    '  node [shape=box, style="rounded,filled", fontname="sans-serif"];',
  );
  for (const n of nodes) {
    const fill = n.data.type === "folder" ? "#f97316" : "#a855f7";
    const label = `${n.data.label}\\n${n.data.extension ? "." + n.data.extension : n.data.type}`;
    lines.push(
      `  "${n.id}" [label="${label}", fillcolor="${fill}", fontcolor="white"];`,
    );
  }
  for (const e of edges) {
    lines.push(`  "${e.source}" -> "${e.target}";`);
  }
  if (includeBranding) lines.push(`  // ${FEWER_CREDIT}`);
  lines.push("}");
  downloadBlob(lines.join("\n"), `fewer-${timestamp()}.dot`, "text/plain");
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
    case "csv":
      return exportCSV(nodes, edges, settings.includeBranding);
    case "dot":
      return exportDOT(nodes, edges, settings.includeBranding);
  }
}
