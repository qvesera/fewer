import type { FewerNode, FewerEdge, LayoutDirection, EdgeStyle } from "./types";
import LZString from "lz-string";

interface ShareData {
  nodes: FewerNode[];
  edges: FewerEdge[];
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  themeMode: string;
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