import type { FewerNode, FewerEdge, LayoutDirection, EdgeStyle, CustomTheme } from "./types";
import LZString from "lz-string";

interface ShareData {
  nodes: FewerNode[];
  edges: FewerEdge[];
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  themeMode: string;
  customTheme?: CustomTheme;
  cornerRadius: number;
  nodeWidth: number;
  nodeHeight: number;
}

/**
 * Encode graph state into a URL-safe compressed string.
 */
export function encodeShareData(data: ShareData): string {
  const json = JSON.stringify(data);
  const compressed = LZString.compressToEncodedURIComponent(json);
  return compressed;
}

/**
 * Decode a compressed URL string back into graph state.
 */
export function decodeShareData(encoded: string): ShareData | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const data = JSON.parse(json);
    // Validate basic shape
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
    return data as ShareData;
  } catch {
    return null;
  }
}

/**
 * Build the full share URL.
 */
export function buildShareUrl(encoded: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#${encoded}`;
}

/**
 * Encoded-hash length above which we store the graph in the DB and use a
 * short `#s:<id>` link instead of embedding the full hash in the URL.
 * ~2000 chars ≈ a few hundred nodes; keeps URLs shareable (Twitter/WhatsApp
 * truncate long URLs, and some clients cap URL length).
 */
export const SHARE_HASH_THRESHOLD = 2000;

/** Build a short DB-backed share URL: `#s:<id>`. */
export function buildDbShareUrl(id: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}#s:${id}`;
}

/** True if a hash fragment is a DB-backed share link (`s:<id>`). */
export function isDbShareHash(hash: string): boolean {
  return hash.startsWith("s:");
}

/** Extract the DB id from a `s:<id>` hash fragment. */
export function parseDbShareId(hash: string): string | null {
  if (!isDbShareHash(hash)) return null;
  const id = hash.slice(2);
  return id || null;
}
