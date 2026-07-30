import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

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

    // Determine the OS-specific command to open the file manager
    const platform = process.platform;
    let cmd: string;
    const escaped = `"${resolved}"`;

    if (platform === "darwin") {
      cmd = `open ${escaped}`;
    } else if (platform === "win32") {
      cmd = `explorer ${escaped.replace(/\//g, "\\")}`;
    } else {
      // Linux and others
      cmd = `xdg-open ${escaped}`;
    }

    await execAsync(cmd, { timeout: 5000 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
