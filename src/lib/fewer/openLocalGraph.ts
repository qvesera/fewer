/**
 * Open a local graph document (`.fwr`) from an absolute path.
 *
 * Three entry points land here and all three must behave identically:
 *  - double-clicking a `.fwr` in the file manager (OS association → argv /
 *    `open-file` → the boot hook in FewerApp),
 *  - **Open Recent**,
 *  - dropping a `.fwr` on the canvas.
 *
 * The reader is injected so bun tests drive the flow without a host bridge.
 */
import type { ImportActionResult } from "./importFlow";
import { parseGraphFile } from "./localLibrary";
import { applySnapshot } from "./snapshot";
import { rememberFile } from "./recentFiles";
import { nativeFsRead } from "./nativeShell";

/** True for Fewer graph documents (.fwr) — the format the OS association claims. */
export function isGraphDocument(path: string): boolean {
  return /\.fwr$/i.test(path);
}

/**
 * Pure parse: `.fwr` envelope → `{ name, data }`, or `null` when the bytes are
 * not a Fewer graph document. Kept separate from the load so the format rules
 * are testable without a store or a host bridge.
 */
export function parseGraphDocument(
  raw: string,
): { name: string; data: Parameters<typeof applySnapshot>[0] } | null {
  try {
    const graph = parseGraphFile(raw);
    if (!graph?.data || !Array.isArray(graph.data.nodes)) return null;
    return { name: graph.name, data: graph.data };
  } catch {
    return null;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read, parse, apply to the canvas, and remember for Open Recent. */
export async function loadGraphFromPath(
  path: string,
  read: (p: string) => Promise<string> = nativeFsRead,
): Promise<ImportActionResult> {
  let raw: string;
  try {
    raw = await read(path);
  } catch (err) {
    return { ok: false, title: "Could not open the file", error: message(err) };
  }

  const doc = parseGraphDocument(raw);
  if (!doc) {
    return {
      ok: false,
      title: "Not a Fewer graph",
      error: `${path} is not a .fwr document. Use Import to load other formats.`,
    };
  }

  applySnapshot(doc.data, { source: "saved" });
  rememberFile(path);
  return { ok: true, title: "Graph opened", description: doc.name };
}