import type { FewerNode, FewerEdge } from "./types";
import LZString from "lz-string";

interface ShareData {
  nodes: FewerNode[];
  edges: FewerEdge[];
  /** Absolute path of the graph root on the share author's machine (see SavedGraphData). */
  localRootPath?: string | null;
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

// ── Hash classification ────────────────────────────────────────────────────

export type ShareHashKind = "invite" | "theme" | "db" | "embedded" | "unknown";

/**
 * Classify a URL hash fragment (with the leading `#` already stripped).
 * The `unknown` branch covers prefixes the current build doesn't handle
 * (e.g. an older bundle receiving a `#t:` link).
 */
export function classifyShareHash(hash: string): ShareHashKind {
  if (hash.startsWith("i:")) return "invite";
  if (hash.startsWith("t:")) return "theme";
  if (hash.startsWith("s:")) return "db";
  // An embedded hash is a raw LZ-string blob (no colon); anything else is unknown.
  if (hash.includes(":")) return "unknown";
  return "embedded";
}

/** Toast shown when a share hash prefix is not supported by this build. */
export const UNSUPPORTED_LINK_MESSAGE =
  "This link requires a newer version of fewer. Reload the page to update.";
