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
import type { Group } from "./groups";
import { normalizeGroups } from "./groups";
import { useGraphStore } from "@/store/graphStore";
import { SNAPSHOT_VERSION, type SavedGraphData } from "./savedGraphs";
import { pruneNodeForSave } from "./snapshot";
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
 * Extra per-format options passed from the ExportPanel: the image formats read
 * the render half (hidden nodes, per-view positions, collapsed folders, tags,
 * edge + node settings) to mirror the live canvas; the `.fwr` document reads
 * `tags`, `groups` and `localRootPath` so a saved graph round-trips whole (T-145).
 */
export interface ExportExtraOptions {
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
  /** Canvas groups carried by the `.fwr` document. */
  groups?: Group[];
  /** Absolute path of the graph root, carried by the `.fwr` document. */
  localRootPath?: string | null;
}

/** Fold the shared image options into the renderer's option bag. */
function imageRenderOptions(
  settings: ExportSettings,
  opts: ExportExtraOptions,
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
    // T-215: exports paint tags exactly as the canvas does — same palette
    // remap, same initials, read off the store the way the UI writes them.
    a11yColorBlindSafe: useGraphStore.getState().a11y?.colorBlindSafe ?? false,
    a11yInitials: useGraphStore.getState().a11y?.tagInitials ?? false,
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
  opts: ExportExtraOptions = {},
) {
  if (nodes.length === 0) return;
  const { svg, width } = buildGraphSVG(nodes, edges, imageRenderOptions(settings, opts));
  if (width === 0) return;
  downloadBlob(svg, `fewer-${timestamp()}.svg`, "image/svg+xml");
}

/* -------------------------------------------------------------------------- */
/*                                  PNG                                       */
/* -------------------------------------------------------------------------- */

/**
 * Browser canvas ceilings. Blink/Gecko take roughly 16384² px and a 32767px
 * side; WebKit (notably iOS) refuses anything above ~16.7M px of area, and a
 * refused canvas makes `toBlob` hand back `null`. `ponytail:` conservative
 * constants used only as the *fallback* size — the exporter first tries the
 * requested scale on whatever engine it is actually running on, so a desktop
 * keeps full resolution and only a genuinely refused size steps down (T-220).
 * Upgrade path: probe a throwaway canvas once and cache the real limits.
 */
export const MAX_CANVAS_DIM = 8192;
export const MAX_CANVAS_AREA = 16_777_216;

/**
 * Largest raster scale that still fits those ceilings — never above
 * `requested`. Pure, so the rule that decides whether an export happens at all
 * is testable without a browser.
 */
export function safeScale(width: number, height: number, requested: number): number {
  if (!(width > 0) || !(height > 0)) return requested;
  const byDim = MAX_CANVAS_DIM / Math.max(width, height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.min(requested, byDim, byArea);
}

/** What a PNG attempt came back with — `ok: false` carries the toast's reason. */
export interface PngRasterResult {
  ok: boolean;
  /** Scale that produced the file (below `requestedScale` when capped). */
  scale: number;
  requestedScale: number;
  /** Failure cause, surfaced verbatim in the error toast. */
  reason?: string;
}

/**
 * Rasterize the export scene and download it. Never resolves silently: a
 * refused decode or encode comes back as `ok: false` with a `reason`, which the
 * panel turns into an error toast instead of a success one (T-219), and a
 * canvas that would not take the requested size retries at `safeScale` before
 * giving up, saying so when it had to step down (T-220).
 *
 * Note: the decode step only exists in a real browser — happy-dom's `Image`
 * fires neither `load` nor `error`, so this path is covered by the
 * well-formedness guard on the emitted SVG (graphRenderer.test.ts), not here.
 */
export async function exportPNG(
  nodes: FewerNode[],
  edges: FewerEdge[],
  settings: ExportSettings,
  opts: ExportExtraOptions = {},
): Promise<PngRasterResult> {
  // PNG ignores the quality argument to toBlob; the slider's % is the pixel
  // scale below (10–100 → 1×–2×).
  const requestedScale = Math.max(1, settings.quality / 50);
  const base = { requestedScale, scale: requestedScale };
  if (nodes.length === 0) return { ...base, ok: true };
  const scene = buildGraphSVG(nodes, edges, imageRenderOptions(settings, opts));
  if (scene.width === 0 || scene.height === 0) return { ...base, ok: true };

  const fallbackScale = safeScale(scene.width, scene.height, requestedScale);
  // Try the requested size first: the caps above are conservative, and a real
  // engine that accepts more gets the resolution it was asked for.
  const candidates =
    fallbackScale === requestedScale ? [requestedScale] : [requestedScale, fallbackScale];

  const blobUrl = URL.createObjectURL(new Blob([scene.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    const decoded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = blobUrl;
    });
    if (!decoded) {
      console.error(
        "fewer: export scene is not a decodable image — PNG export aborted.",
        scene.svg.slice(0, 400),
      );
      return {
        ...base,
        ok: false,
        reason: "The generated image could not be decoded, so no file was downloaded.",
      };
    }

    const canvas = document.createElement("canvas");
    let blob: Blob | null = null;
    let scale = requestedScale;
    for (const candidate of candidates) {
      const w = Math.floor(scene.width * candidate);
      const h = Math.floor(scene.height * candidate);
      canvas.width = w;
      canvas.height = h;
      scale = candidate;
      // A browser that refuses the size reports the old bitmap back instead of
      // throwing — treat that as a failed attempt, not a blank export.
      if (canvas.width !== w || canvas.height !== h) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, w, h);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) break;
    }

    if (!blob) {
      const w = Math.floor(scene.width * scale);
      const h = Math.floor(scene.height * scale);
      console.error(`fewer: ${w}x${h} canvas could not be encoded — PNG export aborted.`);
      return {
        ...base,
        scale,
        ok: false,
        reason: `This browser refused a ${w}×${h} canvas, so no file was downloaded — try a lower Quality.`,
      };
    }
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `fewer-${timestamp()}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ...base, scale, ok: true };
  } finally {
    // Revoked only after the draw: the rasterizer may still read the source.
    URL.revokeObjectURL(blobUrl);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  JSON                                      */
/* -------------------------------------------------------------------------- */

/**
 * Build the JSON export payload. Pure — `exportJSON` downloads it, tests and
 * any future importer can read it without touching the DOM.
 *
 * Reduced, structural export: cards, connections and positions, nothing that
 * maps by node id (tags, groups). The `.fwr` document below is the fidelity
 * format — re-importing a `.json` rebuilds the graph from its structure (T-145).
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
 * The document payload: a real `SavedGraphData` snapshot — cards with their
 * positions and `data`, edges, tags, groups and the local root — so importing
 * the file restores the graph exactly as it was (T-145). Pure: the caller
 * hands in what to write (full canvas or the export selection).
 */
export function buildExportSnapshot(
  nodes: FewerNode[],
  edges: FewerEdge[],
  extras: { tags?: Tag[]; groups?: Group[]; localRootPath?: string | null } = {},
): SavedGraphData {
  // Groups list membership by node id, so a selection-scoped export keeps only
  // the members it actually wrote; normalizeGroups also repairs dangling
  // parents and cycles left by a hand-edited document.
  const groups = normalizeGroups(extras.groups, new Set(nodes.map((n) => n.id)));
  return {
    dataVersion: SNAPSHOT_VERSION,
    nodes: nodes.map(pruneNodeForSave),
    edges,
    tags: extras.tags ?? [],
    groups,
    localRootPath: extras.localRootPath ?? null,
  };
}

/**
 * Fewer graph document (.fwr, T-101): `{ format_version, app, graph }` with a
 * full snapshot in `graph.data` — the same bytes the desktop library writes,
 * so an exported document and a library file are interchangeable. Pure —
 * `exportFWR` downloads it, tests and the importer read exactly these bytes.
 */
export function buildFwrDocument(
  data: SavedGraphData,
  name = `fewer-${timestamp()}`,
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    format_version: 1,
    app: "fewer",
    graph: {
      id: `fwr_${Date.now().toString(36)}`,
      name,
      data,
      created_at: now,
      updated_at: now,
      share: null,
    },
  };
}

export function exportFWR(data: SavedGraphData) {
  downloadBlob(
    JSON.stringify(buildFwrDocument(data), null, 2),
    `fewer-${timestamp()}.fwr`,
    "application/json",
  );
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

/**
 * Dispatch one format. Returns the PNG raster outcome (`ok:false` means the
 * file was NOT downloaded, and carries the reason for the toast) and
 * `undefined` for the formats that finish synchronously (T-219/T-220).
 */
export function exportGraph(
  nodes: FewerNode[],
  edges: FewerEdge[],
  settings: ExportSettings,
  stats?: DirectoryStats,
  opts: ExportExtraOptions = {},
): Promise<PngRasterResult> | undefined {
  switch (settings.format) {
    case "svg":
      exportSVG(nodes, edges, settings, opts);
      return undefined;
    case "png":
      return exportPNG(nodes, edges, settings, opts);
    case "json":
      exportJSON(nodes, edges, stats, settings.includeBranding);
      return undefined;
    case "fwr":
      // A document, not an export payload: full snapshot (T-145).
      exportFWR(
        buildExportSnapshot(nodes, edges, {
          tags: opts.tags,
          groups: opts.groups,
          localRootPath: opts.localRootPath,
        }),
      );
      return undefined;
    case "csv":
      exportCSV(nodes, edges, settings.includeBranding);
      return undefined;
    case "dot":
      exportDOT(nodes, edges, settings.includeBranding);
      return undefined;
  }
}
