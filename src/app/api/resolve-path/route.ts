import { NextResponse } from "next/server";
import fs from "fs";
import { resolveLocalPath } from "@/lib/fewer/openInOs";

/**
 * Local dev helper: resolve a node's relative `data.path` to the absolute path
 * on the dev machine (searching the likely base dirs). The app uses this once,
 * at import/save time, so the graph can persist "where it came from" and open
 * files/folders directly afterwards instead of re-searching on every open.
 * Returns `{ resolved: null }` when nothing matches on this machine.
 */
export async function POST(request: Request) {
  try {
    const { path: rawPath } = await request.json();
    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const resolved = resolveLocalPath(rawPath);
    return NextResponse.json({ resolved: fs.existsSync(resolved) ? resolved : null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}