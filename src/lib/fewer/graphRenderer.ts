import {
  COLLAPSED_PILL_HEIGHT,
  type FewerNode,
  type FewerEdge,
  type FileCategory,
  type LayoutDirection,
} from "./types";
import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
} from "@xyflow/react";
import { FEWER_HOME_URL } from "./branding";
import { colorForTag, TAG_RING_CAP, type Tag } from "./tags";
import { ancestorPathHighlight, buildTreeLookups } from "./edgeHighlight";

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
  selectRing: string;
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
  /** Cards excluded as hidden / outside the export scope. */
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
  /** Folder ids the active view renders as a collapsed pill (not a full card). */
  collapsedIds?: Set<string>;
  /** Tag registry, so exported rings/dots use the same colors as the canvas. */
  tags?: Tag[];
  /**
   * The layout direction the exported view uses. The canvas places handles from
   * the VIEW's direction (GraphViewContext), not from each card's
   * `data.layoutDirection` stamp, so edges must anchor the same way — otherwise
   * a view that only overrides the direction draws lines out of the wrong sides
   * of correctly-placed cards. Falls back to the per-node stamp when omitted.
   */
  direction?: LayoutDirection;
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
/** Collapsed folder pill: 36px icon box + 1px border either side (CustomNode). */
const PILL_HEIGHT = COLLAPSED_PILL_HEIGHT;
/** `.gm-tag-ring` band: 3px wide, hugging the outside of the card border. */
const TAG_RING_WIDTH = 3;
/** `.gm-selected-ring`: `outline: 2px solid` with `outline-offset: 2px`, i.e. a
    2px accent band whose INNER edge sits 2px outside the card border. */
const SELECT_RING_WIDTH = 2;
const SELECT_RING_OFFSET = 2;

/* ------------------------------- helpers ---------------------------------- */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Approximate advance width (in em) for a generic UI sans. Kept slightly
 * conservative vs Inter/Roboto/Segoe/DejaVu so the exported scene never lets
 * text spill past a card edge. */
function charEm(ch: string): number {
  if (ch >= "A" && ch <= "Z") return ch === "M" || ch === "W" ? 0.95 : 0.75;
  if (ch >= "a" && ch <= "z") return 0.62;
  if (ch >= "0" && ch <= "9") return 0.64;
  if (ch === " ") return 0.32;
  if (ch === "…") return 1.0;
  if (",.:;!'".includes(ch)) return 0.35;
  return 0.62;
}

/** Best-effort pixel width of a run of text at the given font size/weight. */
export function estimateTextWidth(text: string, fontSize: number, weight: number): number {
  const factor = weight >= 600 ? 1.05 : 1;
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * fontSize * factor;
}

/**
 * Truncate `s` with an ellipsis so its estimated width fits within `maxPx`.
 * Pure — no DOM required, so it is deterministic and bun-testable.
 */
export function truncateToWidth(s: string, maxPx: number, fontSize: number, weight: number): string {
  const ellipsisW = charEm("…") * fontSize * (weight >= 600 ? 1.05 : 1);
  if (estimateTextWidth(s, fontSize, weight) <= maxPx) return s;
  let w = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const cw = charEm(s[i]) * fontSize * (weight >= 600 ? 1.05 : 1);
    if (w + cw + ellipsisW > maxPx) break;
    w += cw;
  }
  const cut = i > 0 ? i : s.length;
  return `${s.slice(0, cut)}…`;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A folder the active view shows as a collapsed pill (legacy per-node flag or
 *  the leaf's per-view collapsed list). */
function isCollapsedNode(n: FewerNode, o: GraphRenderOptions): boolean {
  if (n.data.type !== "folder") return false;
  return n.data.collapsed === true || (o.collapsedIds?.has(n.id) ?? false);
}

function nodeSize(n: FewerNode, o: GraphRenderOptions): { w: number; h: number } {
  const isFolder = n.data.type === "folder";
  const styleW = typeof n.style?.width === "number" ? n.style.width : undefined;
  const styleH = typeof n.style?.height === "number" ? n.style.height : undefined;
  const mW = n.measured?.width;
  const mH = n.measured?.height;
  const defaultW = o.nodeWidth || DEFAULT_NODE_WIDTH;
  const w = styleW ?? mW ?? defaultW;
  // A collapsed folder is a one-line pill on the canvas whatever its stored
  // height says (CustomNode renders the pill with height auto).
  if (isCollapsedNode(n, o)) return { w, h: PILL_HEIGHT };
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
  /** Ancestor-path highlight for this edge (a selected card is on its path). */
  highlight?: { stroke: string; width: number },
): string {
  const dir = o.direction ?? dirOf(src);
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

  // A highlighted ancestor-path edge wins outright: the canvas's highlight
  // rebuild overwrites stroke + width on exactly these edges, so the image must
  // not fall back to the theme edge color for them.
  const stroke = highlight?.stroke ?? (typeof e.style?.stroke === "string" ? e.style.stroke : o.palette.edge);
  const strokeWidth = highlight?.width
    ?? (typeof e.style?.strokeWidth === "number" ? e.style.strokeWidth : o.defaultEdgeWidth ?? 2);
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

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/** Metric shown on a folder child row: item count for folders, size for files. */
function childMetric(child: FewerNode, edges: FewerEdge[]): string {
  if (child.data.type !== "folder") return formatSize(child.data.size ?? 0);
  const c = edges.filter((e) => e.source === child.id).length;
  return itemCountLabel(c);
}

function childRowIcon(child: FewerNode, p: RenderPalette): { icon: IconName; color: string } {
  const isFolder = child.data.type === "folder";
  return {
    icon: isFolder ? (child.data.isRoot ? "folder-open" : "folder") : CATEGORY_ICON[child.data.category ?? "text"],
    color: isFolder ? p.folderIcon : p.fileIcon,
  };
}

/** Shared layout/palette context for folder child rows. */
interface FolderRowCtx {
  w: number;
  rowBase: number;
  selected: boolean;
  subtleColor: string;
  p: RenderPalette;
  edges: FewerEdge[];
  /** Hidden ids — hidden children stay listed but render desaturated (canvas behavior). */
  hidden?: Set<string>;
}

function renderChildRow(child: FewerNode, i: number, ctx: FolderRowCtx): string {
  const { w, rowBase, selected, subtleColor, p, edges } = ctx;
  const ry = rowBase + i * ITEM_HEIGHT;
  const isFolder = child.data.type === "folder";
  const { icon, color: iconColor } = childRowIcon(child, p);
  const labelColor = isFolder && !selected ? p.folderText : p.text;
  const label = truncateToWidth(child.data.label, w - 96, 12, 400);
  const metric = childMetric(child, edges);
  const chevronX = w - 18;
  // A hidden child is still listed (the canvas lists every child) but faded, the
  // same way CustomNode desaturates hidden entries.
  const dim = ctx.hidden?.has(child.id) ? ' opacity="0.4"' : "";
  return `<g${dim}>
      <g transform="translate(16, ${ry + 7})">${iconSvg(icon, 14, iconColor)}</g>
      <text x="38" y="${ry + 18}" font-size="12" fill="${escapeXml(labelColor)}">${escapeXml(label)}</text>
      <text x="${chevronX - 10}" y="${ry + 17}" text-anchor="end" font-size="10" fill="${escapeXml(subtleColor)}">${escapeXml(metric)}</text>
      <g transform="translate(${chevronX}, ${ry + 10})">${iconSvg("chevron-right", 12, subtleColor)}</g>
    </g>`;
}

/* --------------------------------- tags ----------------------------------- */

/** Card corner radius, mirroring the rounded-* class per node type. */
function cardRadius(n: FewerNode): number {
  return n.data.type === "folder" ? FOLDER_RADIUS : FILE_RADIUS;
}

/** Tag colors assigned to a node, in display order (capped like the canvas). */
function tagColors(n: FewerNode, o: GraphRenderOptions): string[] {
  const ids = n.data.tagIds;
  if (!ids?.length || !o.tags?.length) return [];
  const tags = o.tags;
  return ids.slice(0, TAG_RING_CAP).map((id) => colorForTag(tags, id));
}

/** Width the tag dots row needs (14px pitch + a 14px slack for the "+N"). */
function tagDotsWidth(n: FewerNode): number {
  const count = n.data.tagIds?.length ?? 0;
  if (count === 0) return 0;
  return Math.min(count, TAG_RING_CAP) * 14 + (count > TAG_RING_CAP ? 14 : 0);
}

/**
 * Tag ring. The canvas paints `.gm-tag-ring` as a conic-gradient masked down to
 * the 3px band hugging the outside of the border. SVG has no conic-gradient, so
 * each tag is one stroke of the same rounded-rect outline, split into equal
 * arc-length bands with stroke-dasharray. Band order and the bottom-left seam
 * match `buildTagRingGradient` (first tag starts at the seam, clockwise).
 *
 * ponytail: the DOM splits a SHARP rect by perimeter while this walks the
 * rounded outline, so a boundary landing on a corner drifts by up to the corner
 * sagitta (~1px). Upgrade path: emit explicit per-band path segments.
 */
function renderTagRing(
  n: FewerNode,
  size: { w: number; h: number },
  colors: string[],
): string {
  if (colors.length === 0) return "";
  const r = cardRadius(n) + TAG_RING_WIDTH / 2;
  // The band spans -3px…0px around the border, so its centreline sits at -1.5px.
  const pad = TAG_RING_WIDTH / 2;
  const x = n.position.x - pad;
  const y = n.position.y - pad;
  const w = size.w + TAG_RING_WIDTH;
  const h = size.h + TAG_RING_WIDTH;
  const d = [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
  const path = (color: string, dash?: string, offset?: string) =>
    `<path d="${d}" fill="none" stroke="${escapeXml(color)}" stroke-width="${TAG_RING_WIDTH}"` +
    (dash ? ` stroke-dasharray="${dash}" stroke-dashoffset="${offset}"/>` : "/>");

  if (colors.length === 1) return path(colors[0]);

  const straight = (w - 2 * r) * 2 + (h - 2 * r) * 2;
  const perimeter = straight + 2 * Math.PI * r;
  // Arc length from the path start (top-left corner arc end) to the middle of
  // the bottom-left corner — the seam both the canvas and exports start from.
  const seam = (w - 2 * r) * 2 + (h - 2 * r) + Math.PI * r + (Math.PI * r) / 2;
  const band = perimeter / colors.length;
  return colors
    .map((c, i) =>
      path(
        c,
        `${band.toFixed(2)} ${perimeter.toFixed(2)}`,
        (-(seam + i * band)).toFixed(2),
      ),
    )
    .join("");
}

/**
 * Selection ring, mirroring the canvas's `.gm-selected-ring`
 * (`outline: 2px solid var(--fewer-select-ring); outline-offset: 2px`). Drawn as a
 * rounded-rect outline stroke 2px outside the card border. Returns "" when the
 * node isn't selected, so unselected cards emit no extra element.
 *
 * ponytail: SVG has no `outline-offset`, so the band is approximated by a
 * stroked rounded rect (stroke centreline at -3px, spanning -4…-2px). Arc joins
 * are circular where the DOM's are mitered, so at a 2px width the corner drift
 * is sub-pixel.
 */
function renderSelectionRing(
  n: FewerNode,
  size: { w: number; h: number },
  color: string,
): string {
  const r = cardRadius(n) + SELECT_RING_OFFSET + SELECT_RING_WIDTH / 2;
  const x = n.position.x - SELECT_RING_OFFSET - SELECT_RING_WIDTH / 2;
  const y = n.position.y - SELECT_RING_OFFSET - SELECT_RING_WIDTH / 2;
  const w = size.w + (SELECT_RING_OFFSET + SELECT_RING_WIDTH / 2) * 2;
  const h = size.h + (SELECT_RING_OFFSET + SELECT_RING_WIDTH / 2) * 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${escapeXml(color)}" stroke-width="${SELECT_RING_WIDTH}"/>`;
}

/**
 * Tag assignment dots (canvas: TagDots): one 10px dot per tag, starting at `x`
 * and vertically centred on `y`; anything past the cap collapses to "+N".
 */
function renderTagDots(
  n: FewerNode,
  o: GraphRenderOptions,
  x: number,
  y: number,
): string {
  const ids = n.data.tagIds;
  if (!ids?.length || !o.tags?.length) return "";
  const tags = o.tags;
  const shown = ids.slice(0, TAG_RING_CAP);
  const dots = shown
    .map(
      (id, i) =>
        `<circle cx="${x + i * 14 + 5}" cy="${y}" r="5" fill="${escapeXml(colorForTag(tags, id))}" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`,
    )
    .join("");
  const overflow = ids.length - shown.length;
  if (overflow <= 0) return dots;
  return `${dots}<text x="${x + shown.length * 14 + 2}" y="${y + 4}" font-size="9" font-weight="600" fill="${escapeXml(o.palette.subtle)}">+${overflow}</text>`;
}

/** Shared highlight/border ring logic for folder + file cards. `highlighted`
    (search/ancestor) wins over the plain border. Selection is NOT painted into
    the border — it is drawn as a separate ring OUTSIDE the card
    (`renderSelectionRing`), exactly like the canvas's `.gm-selected-ring`
    outline, so the card keeps its own themed border underneath. */
function cardStroke(
  n: FewerNode,
  border: string,
): { stroke: string; width: number } {
  return {
    stroke: n.data.highlighted ? "#fbbf24" : border,
    width: n.data.highlighted ? 2 : 1,
  };
}

/**
 * Collapsed folder: the one-line pill CustomNode renders instead of a full
 * card — icon box, label over the item count, tag dots and an expand chevron.
 * Child rows are dropped (they belong to the expanded card); the child cards
 * themselves stay on the canvas, exactly as the canvas draws them.
 */
function renderCollapsedFolderCard(
  n: FewerNode,
  childCount: number,
  size: { w: number; h: number },
  o: GraphRenderOptions,
): string {
  const p = o.palette;
  const x = n.position.x;
  const y = n.position.y;
  const w = size.w;
  const h = size.h;
  const selected = o.selectedIds?.has(n.id) ?? false;
  const textColor = selected ? p.text : p.folderText;
  const subtleColor = selected ? p.subtle : p.folderSubtle;
  const { stroke, width: strokeWidth } = cardStroke(n, p.folderBorder);
  const selRing = selected ? renderSelectionRing(n, size, p.selectRing) : "";
  const ring = selected ? "" : renderTagRing(n, size, tagColors(n, o));

  return `<g${n.data.dimmed ? " opacity=\"0.4\"" : ""}>
    ${selRing}
    ${ring}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${FILE_RADIUS}" fill="${p.folderBg}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" filter="url(#filter-folder-shadow)"/>
    <g transform="translate(${x + 20}, ${y + (h - 20) / 2})">${iconSvg(n.data.isRoot ? "folder-open" : "folder", 20, p.folderIcon)}</g>
    <text x="${x + 60}" y="${y + 16}" font-size="14" font-weight="600" fill="${escapeXml(textColor)}">${escapeXml(truncateToWidth(n.data.label, w - 96, 14, 600))}</text>
    <text x="${x + 60}" y="${y + 29}" font-size="10" fill="${escapeXml(subtleColor)}" style="text-transform:uppercase;letter-spacing:0.5px">${escapeXml(itemCountLabel(childCount))}</text>
    ${renderTagDots(n, o, x + w - 34 - Math.min(n.data.tagIds?.length ?? 0, TAG_RING_CAP) * 14, y + h / 2)}
    <g transform="translate(${x + w - 30}, ${y + 11})">${iconSvg("chevron-right", 16, subtleColor)}</g>
  </g>`;
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
  if (isCollapsedNode(n, o)) {
    return renderCollapsedFolderCard(n, rows.length, size, o);
  }
  const childListMaxHeight = Math.max(60, h - 72);
  const visibleRows = Math.min(rows.length, Math.max(0, Math.floor((childListMaxHeight - 12) / ITEM_HEIGHT)));

  const listTop = HEADER_HEIGHT;
  const footerTop = h - FOOTER_HEIGHT;
  const rowBase = listTop + 6;
  const textColor = selected ? p.text : p.folderText;
  const subtleColor = selected ? p.subtle : p.folderSubtle;
  const rootIcon = n.data.isRoot ? "folder-open" : "folder";

  const listRowsHtml = rows
    .slice(0, visibleRows)
    .map((child, i) => renderChildRow(child, i, { w, rowBase, subtleColor, p, edges, selected, hidden: o.hiddenIds }))
    .join("");

  const bodyHtml =
    rows.length === 0
      ? `<text x="${w / 2}" y="${(listTop + footerTop) / 2 + 4}" text-anchor="middle" font-size="12" fill="${escapeXml(subtleColor)}">Empty folder</text>`
      : listRowsHtml;

  const { stroke, width: strokeWidth } = cardStroke(n, p.folderBorder);
  const rowsCount = itemCountLabel(rows.length);
  const selRing = selected ? renderSelectionRing(n, size, p.selectRing) : "";
  const ring = selected ? "" : renderTagRing(n, size, tagColors(n, o));
  // Header tag dots sit right-aligned (canvas: TagDots + chevron in the header
  // row), so the label keeps whatever width they don't use.
  const dotsW = tagDotsWidth(n);
  const dotsX = x + w - 14 - dotsW;

  return `<g${n.data.dimmed ? " opacity=\"0.4\"" : ""}>
    ${selRing}
    ${ring}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${FOLDER_RADIUS}" fill="${p.folderBg}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" filter="url(#filter-folder-shadow)"/>
    <g transform="translate(${x + 12}, ${y + 18})">${iconSvg(rootIcon, 16, p.folderIcon)}</g>
    <text x="${x + 36}" y="${y + 20}" font-size="14" font-weight="600" fill="${escapeXml(textColor)}">${escapeXml(truncateToWidth(n.data.label, w - 48 - dotsW, 14, 600))}</text>
    <text x="${x + 36}" y="${y + 33}" font-size="10" fill="${escapeXml(subtleColor)}">${escapeXml(truncateToWidth(n.data.path, w - 48 - dotsW, 10, 400))}</text>
    ${renderTagDots(n, o, dotsX, y + 26)}
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
  const h = size.h;
  const selected = o.selectedIds?.has(n.id) ?? false;
  const filterId = "filter-file-shadow";
  const icon = CATEGORY_ICON[n.data.category ?? "text"];
  const textColor = selected ? p.text : p.fileText;
  const subtleColor = selected ? p.subtle : p.fileSubtle;
  const { stroke, width: strokeWidth } = cardStroke(n, p.fileBorder);
  const meta = [n.data.extension ? `.${n.data.extension}` : "file", ...(n.data.size ? [formatSize(n.data.size)] : [])].join(" · ");

  // Mirror the canvas file card layout: no horizontal padding (icon box sits
  // flush against the border), gap-3, and the two text lines vertically
  // centered as a block against the icon. Derived from measured height `h` so
  // it adapts instead of assuming a fixed 58px card.
  const boxX = 1;
  const boxW = 36;
  const gap = 12;
  const iconX = x + boxX + (boxW - 20) / 2; // icon (20px) centered in the 36px box
  const iconY = y + (h - 20) / 2;
  // Canvas: TagDots sit in a `shrink-0 pr-2` slot after the text column, so the
  // label's budget shrinks by whatever the dots need.
  const dotsW = tagDotsWidth(n);
  const textX = x + boxX + boxW + gap;
  const labelBudget = w - (textX - x) - 10 - dotsW;
  const label = truncateToWidth(n.data.label, labelBudget, 14, 600);
  const labelLH = 20;
  const metaLH = 14;
  const colTop = y + (h - (labelLH + metaLH)) / 2;
  const labelBaseline = colTop + 13;
  const metaBaseline = colTop + labelLH + 10;
  const ring = selected ? "" : renderTagRing(n, size, tagColors(n, o));
  const selRing = selected ? renderSelectionRing(n, size, p.selectRing) : "";

  return `<g${n.data.dimmed ? " opacity=\"0.4\"" : ""}>
    ${selRing}
    ${ring}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${FILE_RADIUS}" fill="${p.fileBg}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" filter="url(#${filterId})"/>
    <g transform="translate(${iconX}, ${iconY})">${iconSvg(icon, 20, p.fileIcon)}</g>
    <text x="${textX}" y="${labelBaseline}" font-size="14" font-weight="600" fill="${escapeXml(textColor)}">${escapeXml(label)}</text>
    <text x="${textX}" y="${metaBaseline}" font-size="10" fill="${escapeXml(subtleColor)}" style="text-transform:uppercase;letter-spacing:0.5px">${escapeXml(meta)}</text>
    ${renderTagDots(n, o, x + w - 8 - dotsW, y + h / 2)}
  </g>`;
}

/* --------------------------- filters + assembly --------------------------- */

function filterDefs(o: GraphRenderOptions): string {
  const p = o.palette;
  return `<defs>
  <filter id="filter-folder-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="${escapeXml(p.folderIcon)}" flood-opacity="0.28"/></filter>
  <filter id="filter-file-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="${escapeXml(p.fileIcon)}" flood-opacity="0.28"/></filter>
</defs>`;
}

/* ------------------------ "made with fewer" watermark ----------------------- */

/** Inline vector mark (`public/logo_flat.svg` flattened) — embedded directly in
    the exported SVG so it survives rasterization (PNG) and opening the file
    offline. Natural size is ~130.7 × 117.7 units; callers scale it down. */
const LOGO_MARK_PATHS = `<path style="fill:#f97c20;stroke:none" d="M 18.744535,116.66975 V 42.194181 A 21.516756,21.516756 135 0 1 40.261291,20.677425 h 21.48881 a 10.160205,10.160205 26.121466 0 1 8.032801,3.938961 l 4.482039,5.787159 a 10.160205,10.160205 26.121466 0 0 8.032801,3.938961 h 45.530038 a 21.609584,21.609584 45 0 1 21.60958,21.609584 v 60.86611 a 21.574914,21.574914 135.0739 0 1 -21.63057,21.57484 l -87.620365,-0.22602 a 21.497343,21.497343 45.073899 0 1 -21.44189,-21.49727 z" transform="translate(-155.54246,311.95701)"/><g transform="translate(-155.54246,311.95701)"><path d="M 114.98183,60.062214 H 70.412308 A 16.807367,16.807367 135 0 0 53.604941,76.869581 v 61.252969 l 29.17889,0.0592 v -17.74588 a 10.387433,10.387433 135 0 1 10.387433,-10.38743 h 21.747226 c 0,0 -13.52653,-16.079502 -21.656037,-25.256653 5.715055,-6.277277 13.207107,-14.835145 21.719637,-24.729573 z" style="fill:#f9f9f9;stroke-width:0.575981"/><path style="fill:none;stroke:#a657ed;stroke-width:5;stroke-linecap:round;stroke-linejoin:round" d="M 115.51467,60.057317 93.361718,85.054093 115.44653,110.05087"/><path style="fill:#cc9ee5;stroke:#a657ed;stroke-width:5;stroke-linecap:round;stroke-linejoin:round" d="M 93.511771,84.993363 H 74.846246"/><circle style="fill:#a657ed;stroke:none" cx="115.45615" cy="110.03839" r="6.1801715"/><circle style="fill:#a657ed;stroke:none" cx="72.858231" cy="85.035263" r="6.1801715"/><circle style="fill:#a657ed;stroke:none" cx="115.45615" cy="60.958183" r="6.1801715"/></g>`;

/** Display host of the homepage (e.g. "fewer.direct") instead of the full URL,
    so the badge stays compact even if NEXT_PUBLIC_HOME_URL overrides the domain. */
function brandingHost(): string {
  try {
    return new URL(FEWER_HOME_URL).host;
  } catch {
    return FEWER_HOME_URL;
  }
}

/** Corner badge: fewer logo mark + name + host on a translucent pill, linked to
    the homepage. Fixed size keeps it legible over any graph content; sits
    bottom-right like the old credit line. */
function renderBrandingMark(sceneW: number, sceneH: number): string {
  const BW = 118;
  const BH = 30;
  const bx = Math.max(8, sceneW - 14 - BW);
  const by = Math.max(8, sceneH - 14 - BH);
  const scale = 0.13; // 117.7-unit mark → ~15.3px tall in the badge
  return `<a href="${FEWER_HOME_URL}" target="_blank" rel="noopener"><g>
    <rect x="${bx}" y="${by}" width="${BW}" height="${BH}" rx="15" fill="rgba(11, 11, 19, 0.25)" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>
    <g transform="translate(${bx + 10}, ${by + 7.4}) scale(${scale})"><g transform="translate(-31.956073,-332.63444)"><g transform="translate(168.75398)">${LOGO_MARK_PATHS}</g></g></g>
    <text x="${bx + 47}" y="${by + 14}" font-size="11" font-weight="700" fill="#f8f9fa">fewer</text>
    <text x="${bx + 35}" y="${by + 25}" font-size="9" fill="rgba(248, 249, 250, 0.9)">${escapeXml(brandingHost())}</text>
  </g></a>`;
}

/** Edge markup for the export scene, including the ancestor-path highlight.
    The highlight is identical to the canvas's edge highlighting
    (`buildSelectedEdgeHighlight`): when cards are selected, every edge from a
    selected card up to its root parent lights up, stroked with the target
    node's themed folder/file color at width max(edgeWidth, 3). Without this the
    image showed selected cards with all edges still in the default theme color. */
function renderEdgesHtml(
  connectEdges: FewerEdge[],
  edges: FewerEdge[],
  nodes: FewerNode[],
  sizeByNode: Map<string, { w: number; h: number }>,
  o: GraphRenderOptions,
): string {
  const selectedIds = [...(o.selectedIds ?? [])];
  let edgeHighlight: Map<string, { stroke: string; width: number }> | undefined;
  if (selectedIds.length > 0) {
    const { typeByNodeId, parentEdgeOf } = buildTreeLookups(nodes, edges);
    edgeHighlight = ancestorPathHighlight(
      selectedIds,
      parentEdgeOf,
      typeByNodeId,
      (t) => (t === "folder" ? o.palette.folderIcon : o.palette.fileIcon),
      Math.max(o.defaultEdgeWidth ?? 2, 3),
    );
  }

  return connectEdges
    // Highlighted edges paint last so they sit above the rest, like the canvas
    // (which sorts highlighted edges to the end of the array).
    .slice()
    .sort((a, b) => (edgeHighlight?.has(a.id) ? 1 : 0) - (edgeHighlight?.has(b.id) ? 1 : 0))
    .map((e) => {
      const s = nodes.find((nn) => nn.id === e.source);
      const d = nodes.find((nn) => nn.id === e.target);
      if (!s || !d) return "";
      return renderEdge(e, s, d, sizeByNode.get(s.id)!, sizeByNode.get(d.id)!, o, edgeHighlight?.get(e.id));
    })
    .join("\n  ");
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

  const edgesHtml = renderEdgesHtml(connectEdges, edges, nodes, sizeByNode, o);

  const nodesHtml = drawableNodes
    .map((n) =>
      n.data.type === "folder"
        ? renderFolderCard(n, edges, nodes, sizeByNode.get(n.id)!, o)
        : renderFileCard(n, sizeByNode.get(n.id)!, o),
    )
    .join("\n  ");

  const font = o.fontFamily || "sans-serif";
  const brandingSvg = o.includeBranding ? renderBrandingMark(width, height) : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escapeXml(font)}">
  ${filterDefs(o)}
  ${o.transparentBackground ? "" : `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(o.palette.background)}"/>`}
  <g transform="translate(${-minX}, ${-minY})">
  ${edgesHtml}
  ${nodesHtml}
  </g>
  ${brandingSvg}
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
    selectRing: varOr("--fewer-select-ring", "#22d3ee"),
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
