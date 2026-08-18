import type { FewerNode, FewerEdge, FileCategory } from "./types";
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
} from "@xyflow/react";
import { FEWER_CREDIT, FEWER_HOME_URL } from "./branding";

/* -------------------------------------------------------------------------- */
/*  graphRenderer.ts - faithful vector scene builder for PNG/SVG export.      */
/*  Draws what the canvas actually renders: theme colors (CSS vars), real     */
/*  node dimensions, per-style edge geometry (curved/angled/straight),        */
/*  selection glow, search highlight/dim, folder child rows + footer.         */
/*  Pure function => unit-testable in bun without a DOM.                      */
/* -------------------------------------------------------------------------- */

export interface RenderPalette {
  background: string;
  text: string;
  subtle: string;
  edge: string;
  folderBg: string;
  folderBorder: string;
  folderText: string;
  folderSubtle: string;
  folderIcon: string;
  fileBg: string;
  fileBorder: string;
  fileText: string;
  fileSubtle: string;
  fileIcon: string;
}

export interface GraphRenderOptions {
  /** Materialized palette (see readThemePalette for the DOM variant). */
  palette: RenderPalette;
  /** CSS font-family stack, e.g. from computed body font. */
  fontFamily: string;
  /** Node ids to render with the selection glow. */
  selectedIds?: Set<string>;
  /** Nodes excluded as hidden / outside the export scope. */
  hiddenIds?: Set<string>;
  transparentBackground?: boolean;
  includeBranding?: boolean;
  /** Node width/height fallbacks (store nodeWidth/nodeHeight). */
  nodeWidth?: number;
  nodeHeight?: number;
  /** Global edge-width fallback (store edgeWidth). */
  defaultEdgeWidth?: number;
  /** Smoothstep corner radius (store cornerRadius). */
  cornerRadius?: number;
  /** Live dash phase for animated edges (read from --gm-dash-offset). */
  dashOffset?: number;
}

export interface GraphScene {
  svg: string;
  width: number;
  height: number;
}

const DEFAULT_NODE_WIDTH = 240;
const DEFAULT_NODE_HEIGHT = 200;
const FILE_HEIGHT = 58;

const FOLDER_RADIUS = 16; // rounded-2xl
const FILE_RADIUS = 12; // rounded-xl
const ITEM_HEIGHT = 28; // matches CustomNode ITEM_HEIGHT
const HEADER_HEIGHT = 52; // py-2 + h-9 icon box + border-b
const FOOTER_HEIGHT = 28; // item-count footer
const PADDING = 40;

/* ------------------------------- helpers ---------------------------------- */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, maxChars: number): string {
  return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function nodeSize(n: FewerNode, o: GraphRenderOptions): { w: number; h: number } {
  const isFolder = n.data.type === "folder";
  const styleW = typeof n.style?.width === "number" ? n.style.width : undefined;
  const styleH = typeof n.style?.height === "number" ? n.style.height : undefined;
  const mW = n.measured?.width;
  const mH = n.measured?.height;
  const defaultW = o.nodeWidth || DEFAULT_NODE_WIDTH;
  const w = styleW ?? mW ?? defaultW;
  const h = isFolder ? (styleH ?? mH ?? (o.nodeHeight || DEFAULT_NODE_HEIGHT)) : mH ?? FILE_HEIGHT;
  return { w, h };
}

/* -------------------------------- icons ----------------------------------- */

type IconName =
  | "folder"
  | "folder-open"
  | "chevron-right"
  | "file"
  | "file-code"
  | "file-json"
  | "file-image"
  | "file-text"
  | "file-archive"
  | "file-spreadsheet"
  | "file-video"
  | "file-type";

/* Exact lucide v0.525 path data (ISC). */
const ICON_PATHS: Record<IconName, string[]> = {
  folder: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
  "folder-open": ["m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"],
  "chevron-right": ["m9 18 6-6-6-6"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4"],
  "file-code": ["M10 12.5 8 15l2 2.5", "m14 12.5 2 2.5-2 2.5", "M14 2v4a2 2 0 0 0 2 2h4", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"],
  "file-json": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1", "M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"],
  "file-image": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 13h2", "m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"],
  "file-text": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"],
  "file-archive": ["M10 12v-1", "M10 18v-2", "M10 7V6", "M14 2v4a2 2 0 0 0 2 2h4", "M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01"],
  "file-spreadsheet": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M8 13h2", "M14 13h2", "M8 17h2", "M14 17h2"],
  "file-video": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "m10 11 5 3-5 3v-6Z"],
  "file-type": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M9 13v-1h6v1", "M12 12v6", "M11 18h2"],
};

const CATEGORY_ICON: Record<FileCategory, IconName> = {
  code: "file-code",
  config: "file-json",
  image: "file-image",
  document: "file-text",
  archive: "file-archive",
  data: "file-spreadsheet",
  media: "file-video",
  binary: "file",
  text: "file-type",
};

function iconSvg(name: IconName, size: number, color: string): string {
  const paths = ICON_PATHS[name].map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${escapeXml(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/* -------------------------------- edges ----------------------------------- */

type LayoutDir = "TB" | "BT" | "LR" | "RL";

function anchor(dir: LayoutDir, w: number, h: number, isSource: boolean): { x: number; y: number } {
  switch (dir) {
    case "TB":
      return isSource ? { x: w / 2, y: h } : { x: w / 2, y: 0 };
    case "BT":
      return isSource ? { x: w / 2, y: 0 } : { x: w / 2, y: h };
    case "LR":
      return isSource ? { x: w, y: h / 2 } : { x: 0, y: h / 2 };
    default:
      return isSource ? { x: 0, y: h / 2 } : { x: w, y: h / 2 };
  }
}

function dirPositions(dir: LayoutDir): { source: Position; target: Position } {
  switch (dir) {
    case "TB":
      return { source: Position.Bottom, target: Position.Top };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "LR":
      return { source: Position.Right, target: Position.Left };
    default:
      return { source: Position.Left, target: Position.Right };
  }
}

function dirOf(n: FewerNode): LayoutDir {
  const d = n.data?.layoutDirection;
  return d === "BT" || d === "LR" || d === "RL" ? d : "TB";
}

function renderEdge(
  e: FewerEdge,
  src: FewerNode,
  dst: FewerNode,
  srcSize: { w: number; h: number },
  dstSize: { w: number; h: number },
  o: GraphRenderOptions,
): string {
  const dir = dirOf(src);
  const sa = anchor(dir, srcSize.w, srcSize.h, true);
  const sxa = src.position.x + sa.x;
  const sya = src.position.y + sa.y;
  const da = anchor(dir, dstSize.w, dstSize.h, false);
  const txa = dst.position.x + da.x;
  const tya = dst.position.y + da.y;
  const { source, target } = dirPositions(dir);

  let path: string;
  const type = e.type ?? "default";
  if (type === "straight") {
    [path] = getStraightPath({ sourceX: sxa, sourceY: sya, targetX: txa, targetY: tya });
  } else if (type === "smoothstep") {
    [path] = getSmoothStepPath({
      sourceX: sxa,
      sourceY: sya,
      sourcePosition: source,
      targetX: txa,
      targetY: tya,
      targetPosition: target,
      borderRadius: o.cornerRadius ?? 8,
    });
  } else {
    [path] = getBezierPath({
      sourceX: sxa,
      sourceY: sya,
      sourcePosition: source,
      targetX: txa,
      targetY: tya,
      targetPosition: target,
    });
  }

  const stroke = typeof e.style?.stroke === "string" ? e.style.stroke : o.palette.edge;
  const strokeWidth = typeof e.style?.strokeWidth === "number" ? e.style.strokeWidth : o.defaultEdgeWidth ?? 2;
  const dash = typeof e.style?.strokeDasharray === "string" ? e.style.strokeDasharray : undefined;

  const attrs = [`d="${path}"`, `stroke="${escapeXml(stroke)}"`, `stroke-width="${strokeWidth}"`, "fill=\"none\""];
  if (dash) {
    attrs.push(`stroke-dasharray="${dash}"`);
    if (o.dashOffset !== undefined) attrs.push(`stroke-dashoffset="${o.dashOffset}"`);
  }
  return `<path ${attrs.join(" ")}/>`;
}

/* ------------------------------- nodes ------------------------------------ */

function childRows(node: FewerNode, edges: FewerEdge[], nodes: FewerNode[]): FewerNode[] {
  const childIds = edges.filter((e) => e.source === node.id).map((e) => e.target);
  const list = nodes.filter((n) => childIds.includes(n.id));
  list.sort((a, b) => {
    if (a.data.type !== b.data.type) return a.data.type === "folder" ? -1 : 1;
    return a.data.label.localeCompare(b.data.label);
  });
  return list;
}

function renderFolderCard(
  n: FewerNode,
  edges: FewerEdge[],
  nodes: FewerNode[],
  size: { w: number; h: number },
  o: GraphRenderOptions,
): string {
  const p = o.palette;
  const x = n.position.x;
  const y = n.position.y;
  const w = size.w;
  const h = size.h;
  const selected = o.selectedIds?.has(n.id) ?? false;

  const rows = childRows(n, edges, nodes);
  const childListMaxHeight = Math.max(60, h - 72);
  const visibleRows = Math.min(rows.length, Math.max(0, Math.floor((childListMaxHeight - 12) / ITEM_HEIGHT)));

  const listTop = HEADER_HEIGHT;
  const footerTop = h - FOOTER_HEIGHT;
  const rowBase = listTop + 6;
  const textColor = selected ? p.text : p.folderText;
  const subtleColor = selected ? p.subtle : p.folderSubtle;
  const rootIcon = n.data.isRoot ? "folder-open" : "folder";

  const listRowsHtml = rows.slice(0, visibleRows).map((child, i) => {
    const ry = rowBase + i * ITEM_HEIGHT;
    const isFolder = child.data.type === "folder";
    const icon = isFolder ? (child.data.isRoot ? "folder-open" : "folder") : CATEGORY_ICON[child.data.category ?? "text"];
    const iconColor = isFolder ? p.folderIcon : p.fileIcon;
    const labelColor = isFolder && !selected ? p.folderText : p.text;
    const label = truncate(child.data.label, Math.max(8, Math.floor((w - 96) / 7)));
    const metric = isFolder
      ? (() => {
          const c = edges.filter((e) => e.source === child.id).length;
          return `${c} ${c === 1 ? "item" : "items"}`;
        })()
      : formatSize(child.data.size ?? 0);
    const chevronX = w - 18;
    return `<g>
      <g transform="translate(16, ${ry + 7})">${iconSvg(icon, 14, iconColor)}</g>
      <text x="38" y="${ry + 18}" font-size="12" fill="${escapeXml(labelColor)}">${escapeXml(label)}</text>
      <text x="${chevronX - 10}" y="${ry + 17}" text-anchor="end" font-size="10" fill="${escapeXml(subtleColor)}">${escapeXml(metric)}</text>
      <g transform="translate(${chevronX}, ${ry + 10})">${iconSvg("chevron-right", 12, subtleColor)}</g>
    </g>`;
  }).join("");

  let bodyHtml = listRowsHtml;
  if (rows.length === 0) {
    bodyHtml = `<text x="${w / 2}" y="${(listTop + footerTop) / 2 + 4}" text-anchor="middle" font-size="12" fill="${escapeXml(subtleColor)}">Empty folder</text>`;
  }

  const filterId = selected ? "filter-glow" : "filter-folder-shadow";
  const stroke = n.data.highlighted ? "#fbbf24" : p.folderBorder;
  const strokeWidth = n.data.highlighted ? 2 : 1;
  const rowsCount = `${rows.length} ${rows.length === 1 ? "item" : "items"}`;

  return `<g${n.data.dimmed ? " opacity=\"0.4\"" : ""}>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${FOLDER_RADIUS}" fill="${p.folderBg}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" filter="url(#${filterId})"/>
    <g transform="translate(${x + 12}, ${y + 18})">${iconSvg(rootIcon, 16, p.folderIcon)}</g>
    <text x="${x + 36}" y="${y + 20}" font-size="14" font-weight="600" fill="${escapeXml(textColor)}">${escapeXml(truncate(n.data.label, Math.max(8, Math.floor((w - 48) / 8))))}</text>
    <text x="${x + 36}" y="${y + 33}" font-size="10" fill="${escapeXml(subtleColor)}">${escapeXml(truncate(n.data.path, Math.max(8, Math.floor((w - 48) / 6))))}</text>
    <line x1="${x}" y1="${y + HEADER_HEIGHT}" x2="${x + w}" y2="${y + HEADER_HEIGHT}" stroke="${escapeXml(p.folderBorder)}" stroke-width="1"/>
    <g transform="translate(${x}, ${y})">${bodyHtml}</g>
    <line x1="${x}" y1="${y + footerTop}" x2="${x + w}" y2="${y + footerTop}" stroke="${escapeXml(p.folderBorder)}" stroke-width="1"/>
    <text x="${x + 12}" y="${y + footerTop + 18}" font-size="10" fill="${escapeXml(subtleColor)}" style="text-transform:uppercase;letter-spacing:0.5px">${escapeXml(rowsCount)}</text>
  </g>`;
}

function renderFileCard(n: FewerNode, size: { w: number; h: number }, o: GraphRenderOptions): string {
  const p = o.palette;
  const x = n.position.x;
  const y = n.position.y;
  const w = size.w;
  const selected = o.selectedIds?.has(n.id) ?? false;
  const filterId = selected ? "filter-glow" : "filter-file-shadow";
  const icon = CATEGORY_ICON[n.data.category ?? "text"];
  const textColor = selected ? p.text : p.fileText;
  const subtleColor = selected ? p.subtle : p.fileSubtle;
  const stroke = n.data.highlighted ? "#fbbf24" : p.fileBorder;
  const strokeWidth = n.data.highlighted ? 2 : 1;
  const label = truncate(n.data.label, Math.max(8, Math.floor((w - 96) / 8)));
  const meta = [n.data.extension ? `.${n.data.extension}` : "file", ...(n.data.size ? [formatSize(n.data.size)] : [])].join(" · ");

  return `<g${n.data.dimmed ? " opacity=\"0.4\"" : ""}>
    <rect x="${x}" y="${y}" width="${w}" height="${size.h}" rx="${FILE_RADIUS}" fill="${p.fileBg}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" filter="url(#${filterId})"/>
    <g transform="translate(${x + 16}, ${y + 19})">${iconSvg(icon, 20, p.fileIcon)}</g>
    <text x="${x + 56}" y="${y + 26}" font-size="14" font-weight="600" fill="${escapeXml(textColor)}">${escapeXml(label)}</text>
    <text x="${x + 56}" y="${y + 43}" font-size="10" fill="${escapeXml(subtleColor)}" style="text-transform:uppercase;letter-spacing:0.5px">${escapeXml(meta)}</text>
  </g>`;
}

/* --------------------------- filters + assembly --------------------------- */

function filterDefs(o: GraphRenderOptions): string {
  const p = o.palette;
  return `<defs>
  <filter id="filter-folder-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="${escapeXml(p.folderIcon)}" flood-opacity="0.28"/></filter>
  <filter id="filter-file-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="${escapeXml(p.fileIcon)}" flood-opacity="0.28"/></filter>
  <filter id="filter-glow" x="-60%" y="-60%" width="220%" height="220%">
    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#22d3ee" flood-opacity="0.35"/>
    <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#22d3ee" flood-opacity="0.14"/>
  </filter>
</defs>`;
}

/** Build an SVG scene exactly reflecting current graph + theme state. */
export function buildGraphSVG(nodes: FewerNode[], edges: FewerEdge[], o: GraphRenderOptions): GraphScene {
  const hidden = o.hiddenIds ?? new Set<string>();
  const drawableNodes = hidden.size === 0 ? nodes : nodes.filter((n) => !hidden.has(n.id));
  const drawable = new Set(drawableNodes.map((n) => n.id));
  const connectEdges = edges.filter((e) => drawable.has(e.source) && drawable.has(e.target));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of drawableNodes) {
    const s = nodeSize(n, o);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + s.w);
    maxY = Math.max(maxY, n.position.y + s.h);
  }
  if (!isFinite(minX)) return { svg: "", width: 0, height: 0 };
  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;
  const width = maxX - minX;
  const height = maxY - minY;

  const sizeByNode = new Map<string, { w: number; h: number }>();
  for (const n of nodes) sizeByNode.set(n.id, nodeSize(n, o));

  const edgesHtml = connectEdges
    .map((e) => {
      const s = nodes.find((nn) => nn.id === e.source);
      const d = nodes.find((nn) => nn.id === e.target);
      if (!s || !d) return "";
      return renderEdge(e, s, d, sizeByNode.get(s.id)!, sizeByNode.get(d.id)!, o);
    })
    .join("\n  ");

  const nodesHtml = drawableNodes
    .map((n) =>
      n.data.type === "folder"
        ? renderFolderCard(n, edges, nodes, sizeByNode.get(n.id)!, o)
        : renderFileCard(n, sizeByNode.get(n.id)!, o),
    )
    .join("\n  ");

  const font = o.fontFamily || "sans-serif";
  const fontSvg = o.includeBranding
    ? `<a href="${FEWER_HOME_URL}" target="_blank" rel="noopener"><text x="${width - 14}" y="${height - 12}" text-anchor="end" font-size="11" fill="${escapeXml(o.palette.subtle)}">${escapeXml(FEWER_CREDIT)}</text></a>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeXml(font)}">
  ${filterDefs(o)}
  ${o.transparentBackground ? "" : `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(o.palette.background)}"/>`}
  <g transform="translate(${-minX}, ${-minY})">
  ${edgesHtml}
  ${nodesHtml}
  </g>
  ${fontSvg}
</svg>`;

  return { svg, width, height };
}

/* --------------------------- DOM theme snapshot --------------------------- */

/**
 * Resolve the live `--fewer-*` palette from whatever theme is active
 * (light `:root` defaults, `.dark`, or an inline custom theme). getComputedStyle
 * on documentElement accounts for all three. Falls back to the app's dark
 * defaults if a variable is somehow unset.
 */
export function readThemePalette(): RenderPalette {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const varOr = (name: string, fallback: string): string => (cs.getPropertyValue(name) || "").trim() || fallback;
  return {
    background: varOr("--fewer-background", "#0b0b13"),
    text: varOr("--fewer-text", "#f8f9fa"),
    subtle: varOr("--fewer-text-subtle", "#adb5bd"),
    edge: varOr("--fewer-edge", "rgba(173, 181, 189, 0.5)"),
    folderBg: varOr("--fewer-folder-bg", "rgba(253, 126, 20, 0.12)"),
    folderBorder: varOr("--fewer-folder-border", "rgba(253, 126, 20, 0.45)"),
    folderText: varOr("--fewer-folder-text", "#ffd8a8"),
    folderSubtle: varOr("--fewer-folder-subtle-text", "#adb5bd"),
    folderIcon: varOr("--fewer-folder-icon", "#ffa94d"),
    fileBg: varOr("--fewer-file-bg", "rgba(190, 75, 219, 0.18)"),
    fileBorder: varOr("--fewer-file-border", "rgba(190, 75, 219, 0.45)"),
    fileText: varOr("--fewer-file-text", "#f8f9fa"),
    fileSubtle: varOr("--fewer-file-subtle-text", "#adb5bd"),
    fileIcon: varOr("--fewer-file-icon", "#e599f7"),
  };
}

export function readBodyFont(): string {
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

/** Live animated-edge dash phase, if any. Used to keep static dash phase. */
export function readDashOffset(): number | undefined {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--gm-dash-offset").trim();
  if (!v) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}
