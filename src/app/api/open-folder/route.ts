import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/** Open `resolved` in the OS file manager. Uses spawn (shell:false) with an
 *  args array so paths with spaces/quotes aren't mangled by a shell. */
function openInFileManager(resolved: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === "darwin") {
      cmd = "open";
      args = [resolved];
    } else if (platform === "win32") {
      // `explorer <path>` does not strip quotes from its own argument, so a
      // quoted path (required for spaces) just fails. Route through cmd's
      // `start` built-in instead: `start "" "<path>"` — the empty quoted arg
      // is the window title, the second is the folder to open.
      cmd = "cmd.exe";
      args = ["/c", "start", "", resolved];
    } else {
      cmd = "xdg-open";
      args = [resolved];
    }

    const child = spawn(cmd, args, { shell: false });
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    child.on("error", done);
    child.on("exit", () => done());
    // Safety net so the request never hangs if the child never exits.
    setTimeout(() => done(), 5000);
  });
}

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

    await openInFileManager(resolved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
