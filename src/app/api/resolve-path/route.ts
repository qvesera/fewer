import { NextResponse } from "next/server";
import { resolveLocalPath, requireLocalhost } from "@/lib/fewer/openInOs";

/**
 * Local dev helper: resolve a node's relative `data.path` to the absolute path
 * on the dev machine. The app uses this once, at import/save time, so the graph
 * can persist "where it came from" and open files/folders directly afterwards.
 * Returns `{ resolved: null }` when nothing matches on this machine.
 */
export async function POST(request: Request) {
  try {
    const blocked = requireLocalhost(request);
    if (blocked) return blocked;

    const { path: rawPath } = await request.json();
    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const resolved = await resolveLocalPath(rawPath);
    return NextResponse.json({ resolved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}