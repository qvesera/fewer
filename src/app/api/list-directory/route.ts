import { NextResponse } from "next/server";
import fs from "fs";
import nodePath from "path";
import { buildTreeFromPath } from "@/lib/fewer/localTree";
import type { ImportOptions } from "@/lib/fewer/importOptions";
import { DEFAULT_IMPORT_OPTIONS } from "@/lib/fewer/importOptions";
import { requireLocalhost } from "@/lib/fewer/openInOs";

/**
 * Local dev helper (mirrors /api/resolve-path and /api/open-file): list a
 * local directory into a TreeEntry, applying the same ImportOptions that the
 * File System Access walk uses. Used when a drag-and-drop delivers the dropped
 * folder as a local path instead of a directory handle/entry (portalized
 * Chromium builds on Flatpak/Snap).
 */
export async function POST(request: Request) {
  try {
    const blocked = requireLocalhost(request);
    if (blocked) return blocked;

    const body = await request.json().catch(() => null);
    const rawPath = typeof body?.path === "string" ? body.path : "";
    const options: ImportOptions = {
      ...DEFAULT_IMPORT_OPTIONS,
      ...(typeof body?.options === "object" && body.options
        ? (body.options as Partial<ImportOptions>)
        : {}),
    };

    if (!rawPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    if (!nodePath.isAbsolute(rawPath)) {
      return NextResponse.json({ error: "Not an absolute path" }, { status: 400 });
    }

    const target = nodePath.resolve(rawPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      return NextResponse.json({ error: `Not found: ${rawPath}` }, { status: 404 });
    }
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: `Not a directory: ${rawPath}` }, { status: 400 });
    }

    const tree = await buildTreeFromPath(target, 0, options);
    return NextResponse.json({ tree });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}