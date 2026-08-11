import type { FewerNode, FewerEdge, LayoutDirection, EdgeStyle, CustomTheme, ThemeMode } from "./types";

/** Serializable snapshot of the full app state for a saved graph. */
export interface SavedGraphData {
  nodes: FewerNode[];
  edges: FewerEdge[];
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  edgeAnimated: boolean;
  edgeStrokeStyle: string;
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