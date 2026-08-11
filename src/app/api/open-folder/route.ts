import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { openInOs } from "@/lib/fewer/openInOs";

export async function POST(request: Request) {
  try {
    const { path: rawPath } = await request.json();
    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    // The data.path includes the root directory name as the first component
    // (e.g. "ssy-react/src/logic"), so we resolve from the parent of the
    // app's root to handle sibling directories correctly.
    // path.resolve("ssy-react/src/logic") would give /app/root/ssy-react/src/logic
    // but we want /app/parent/ssy-react/src/logic
    const baseDir = path.dirname(process.cwd());
    const resolved = path.resolve(baseDir, rawPath);

    // Check if the path exists
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: `Path does not exist: ${resolved}` }, { status: 404 });
    }

    await openInOs(resolved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
