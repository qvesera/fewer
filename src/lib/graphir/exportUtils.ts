import type {
  GraphirNode,
  GraphirEdge,
  ExportSettings,
  DirectoryStats,
} from "./types";
import { LAYOUT_DIMENSIONS } from "./layout";

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
    d.getHours()
  )}${pad(d.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/*                                  SVG                                       */
/* -------------------------------------------------------------------------- */

export function exportSVG(
  nodes: GraphirNode[],
  edges: GraphirEdge[],
  settings: ExportSettings
) {
  if (nodes.length === 0) return;
  const padding = 40;
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + LAYOUT_DIMENSIONS.width + padding;
  const maxY = Math.max(...ys) + LAYOUT_DIMENSIONS.height + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const edgePaths = edges
    .map((e) => {
      const s = nodes.find((n) => n.id === e.source);
      const t = nodes.find((n) => n.id === e.target);
      if (!s || !t) return "";
      const sx = s.position.x - minX + LAYOUT_DIMENSIONS.width / 2;
      const sy = s.position.y - minY + LAYOUT_DIMENSIONS.height;
      const tx = t.position.x - minX + LAYOUT_DIMENSIONS.width / 2;
      const ty = t.position.y - minY;
      const my = (sy + ty) / 2;
      return `<path d="M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}" stroke="rgba(120,120,140,0.6)" stroke-width="1.5" fill="none" />`;
    })
    .join("\n  ");

  const nodeRects = nodes
    .map((n) => {
      const x = n.position.x - minX;
      const y = n.position.y - minY;
      const isFolder = n.data.type === "folder";
      const fill = isFolder ? "#f97316" : "#a855f7";
      const textFill = "white";
      return `  <g transform="translate(${x}, ${y})">
    <rect width="${LAYOUT_DIMENSIONS.width}" height="${LAYOUT_DIMENSIONS.height}" rx="10" fill="${fill}" stroke="rgba(255,255,255,0.15)" />
    <text x="14" y="26" font-family="sans-serif" font-size="14" font-weight="600" fill="${textFill}">${escape(
      n.data.label
    )}</text>
    <text x="14" y="46" font-family="sans-serif" font-size="11" fill="${textFill}" opacity="0.85">${escape(
      n.data.extension ? `.${n.data.extension}` : n.data.type
    )}</text>
  </g>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${
    settings.transparentBackground ? "none" : "#0b0b13"
  }" />
  ${edgePaths}
${nodeRects}
</svg>`;

  downloadBlob(svg, `graphir-${timestamp()}.svg`, "image/svg+xml");
}

/* -------------------------------------------------------------------------- */
/*                                  PNG                                       */
/* -------------------------------------------------------------------------- */

export function exportPNG(
  nodes: GraphirNode[],
  edges: GraphirEdge[],
  settings: ExportSettings
) {
  if (nodes.length === 0) return;
  const padding = 40;
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + LAYOUT_DIMENSIONS.width + padding;
  const maxY = Math.max(...ys) + LAYOUT_DIMENSIONS.height + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  const scale = Math.max(1, settings.quality / 50);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  if (!settings.transparentBackground) {
    ctx.fillStyle = "#0b0b13";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  for (const e of edges) {
    const s = nodes.find((n) => n.id === e.source);
    const t = nodes.find((n) => n.id === e.target);
    if (!s || !t) continue;
    const sx = s.position.x - minX + LAYOUT_DIMENSIONS.width / 2;
    const sy = s.position.y - minY + LAYOUT_DIMENSIONS.height;
    const tx = t.position.x - minX + LAYOUT_DIMENSIONS.width / 2;
    const ty = t.position.y - minY;
    const my = (sy + ty) / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx, my, tx, my, tx, ty);
    ctx.stroke();
  }

  for (const n of nodes) {
    const x = n.position.x - minX;
    const y = n.position.y - minY;
    const isFolder = n.data.type === "folder";
    ctx.fillStyle = isFolder ? "#f97316" : "#a855f7";
    roundedRect(ctx, x, y, LAYOUT_DIMENSIONS.width, LAYOUT_DIMENSIONS.height, 10);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "600 14px sans-serif";
    ctx.fillText(truncate(n.data.label, 22), x + 14, y + 26);
    ctx.font = "11px sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText(
      n.data.extension ? `.${n.data.extension}` : n.data.type,
      x + 14,
      y + 46
    );
    ctx.globalAlpha = 1;
  }

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `graphir-${timestamp()}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    "image/png",
    settings.quality / 100
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/* -------------------------------------------------------------------------- */
/*                                  JSON                                      */
/* -------------------------------------------------------------------------- */

export function exportJSON(
  nodes: GraphirNode[],
  edges: GraphirEdge[],
  stats?: DirectoryStats
) {
  const payload = {
    meta: {
      exportedAt: new Date().toISOString(),
      application: "Graphir Pro Max Ultra",
      version: "1.0.0",
    },
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
    `graphir-${timestamp()}.json`,
    "application/json"
  );
}

/* -------------------------------------------------------------------------- */
/*                                  CSV                                       */
/* -------------------------------------------------------------------------- */

export function exportCSV(nodes: GraphirNode[], edges: GraphirEdge[]) {
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
  downloadBlob(lines.join("\n"), `graphir-${timestamp()}.csv`, "text/csv");
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

export function exportDOT(nodes: GraphirNode[], edges: GraphirEdge[]) {
  const lines: string[] = [];
  lines.push("digraph graphir {");
  lines.push('  graph [rankdir="TB", bgcolor="transparent"];');
  lines.push('  node [shape=box, style="rounded,filled", fontname="sans-serif"];');
  for (const n of nodes) {
    const fill = n.data.type === "folder" ? "#f97316" : "#a855f7";
    const label = `${n.data.label}\\n${n.data.extension ? "." + n.data.extension : n.data.type}`;
    lines.push(
      `  "${n.id}" [label="${label}", fillcolor="${fill}", fontcolor="white"];`
    );
  }
  for (const e of edges) {
    lines.push(`  "${e.source}" -> "${e.target}";`);
  }
  lines.push("}");
  downloadBlob(lines.join("\n"), `graphir-${timestamp()}.dot`, "text/plain");
}

/* -------------------------------------------------------------------------- */
/*                                Dispatcher                                   */
/* -------------------------------------------------------------------------- */

export function exportGraph(
  nodes: GraphirNode[],
  edges: GraphirEdge[],
  settings: ExportSettings,
  stats?: DirectoryStats
) {
  switch (settings.format) {
    case "svg":
      return exportSVG(nodes, edges, settings);
    case "png":
      return exportPNG(nodes, edges, settings);
    case "json":
      return exportJSON(nodes, edges, stats);
    case "csv":
      return exportCSV(nodes, edges);
    case "dot":
      return exportDOT(nodes, edges);
  }
}
