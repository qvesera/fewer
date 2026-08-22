import { NextResponse } from "next/server";
import fs from "fs";
import { openInOs, resolveLocalPath, requireLocalhost } from "@/lib/fewer/openInOs";

export async function POST(request: Request) {
  try {
    const blocked = requireLocalhost(request);
    if (blocked) return blocked;

    const { path: rawPath } = await request.json();
    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const resolved = await resolveLocalPath(rawPath);

    if (!resolved) {
      return NextResponse.json({ error: `Path does not exist on this machine: ${rawPath}` }, { status: 404 });
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: `Path does not exist: ${resolved}` }, { status: 404 });
    }
    if (!fs.statSync(resolved).isFile()) {
      return NextResponse.json({ error: `Not a file: ${resolved}` }, { status: 400 });
    }

    await openInOs(resolved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
