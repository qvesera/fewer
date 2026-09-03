import type { FewerNode, FewerEdge } from "./types";

/**
 * Serializable snapshot of a graph for a saved graph row.
 *
 * Graph *data* only — app settings (direction, edge styling, node dims,
 * theme, minimap, display filters, scroll action) are per-account user
 * settings, synced separately, and must NOT ride along with the graph. On load
 * the viewer's current settings win, so restoring a graph never clobbers them.
 */
export interface SavedGraphData {
  nodes: FewerNode[];
  edges: FewerEdge[];
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