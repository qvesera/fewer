import type { FewerNode, FewerEdge, LayoutDirection, EdgeStyle, CustomTheme, ThemeMode } from "./types";

/** Serializable snapshot of the full app state for a saved graph. */
export interface SavedGraphData {
  nodes: FewerNode[];
  edges: FewerEdge[];
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  edgeAnimated: boolean;
  /** When true, only ancestor-path edges of selected nodes animate (works standalone). */
  edgeAnimatedSelectedOnly?: boolean;
  edgeStrokeStyle: string;
  /** Dash pattern for animated edges only (dashed | dotted); defaults to dashed. */
  edgeAnimatedStrokeStyle?: string;
  edgeWidth: number;
  cornerRadius: number;
  nodeWidth: number;
  nodeHeight: number;
  themeMode: ThemeMode;
  customTheme?: CustomTheme;
  showFiles: boolean;
  maxDisplayDepth: number;
  autoHideThreshold: number;
  showMiniMap: boolean;
  miniMapPosition: string;
  miniMapSize: number;
  /** Free-form minimap offset (px from top-left) when miniMapPosition === "custom". */
  miniMapX?: number;
  miniMapY?: number;
  /** Wheel behavior saved with the graph: "pan" (vertical pan, Ctrl+wheel zoom) or "zoom". */
  scrollAction?: "pan" | "zoom";
  /** Absolute path of the graph's root folder on the originating dev machine
   *  (resolved at import time). Lets a graph opened later — including from the
   *  cloud — open files/folders directly when the path is still there, instead
   *  of searching the filesystem each time. Optional: null/absent when the
   *  graph didn't come from a locally-resolvable directory. */
  localRootPath?: string | null;
}

export interface SavedGraph {
  id: string;
  name: string;
  data: SavedGraphData;
  created_at: string;
  updated_at: string;
  /** Pinned to the top of the saved-graph list. */
  is_favorite?: boolean;
  /** Active share for this graph (owner only), if any. */
  share?: { access: "public" | "invite" } | null;
}

export interface ShareInfo {
  id: string;
  access: "public" | "invite";
  invited_emails: string[];
}

/** Build the share URL for a DB-backed share id. */
export function buildDbShareUrl(id: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#s:${id}`;
}