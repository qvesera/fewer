// Server-only helper: open a resolved absolute path in the OS default app /
// file manager. Used by the /api/open-folder and /api/open-file route handlers.
// This runs on the machine hosting the dev server (a "local dev helper").
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

/**
 * Resolve a node's `data.path` to a real absolute path on this dev machine.
 *
 * The browser never exposes the absolute location of a user-picked folder
 * (`showDirectoryPicker` returns an opaque handle), so a directory import only
 * stores the folder's name/hierarchy (e.g. `test_csv_import` or
 * `ssy-react/src/logic`). We therefore try the likeliest base directories and
 * pick the first whose joined path actually exists:
 *
 *   1. a sibling of the app root  (original behavior — imported projects that
 *      live next to this one, e.g. `ssy-react` beside `fewer`)
 *   2. the app root itself        (importing the project you're working in)
 *   3. the user's home directory  (the most common place to pick a folder from)
 *
 * If none exists we fall back to the historical `dirname(cwd)` result so the
 * routes still 404 with the concrete path instead of throwing.
 */
export function resolveLocalPath(rawPath: string): string {
  const cwd = process.cwd();
  const bases = [path.dirname(cwd), cwd, os.homedir()];
  const found = bases
    .map((base) => path.resolve(base, rawPath))
    .find((p) => fs.existsSync(p));
  return found ?? path.resolve(path.dirname(cwd), rawPath);
}

export function openInOs(resolved: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === "darwin") {
      cmd = "open";
      args = [resolved]; // opens both files (default app) and folders
    } else if (platform === "win32") {
      // `explorer <path>` doesn't strip quotes from its own argument, so route
      // through cmd's `start` built-in: `start "" "<path>"` — the empty quoted
      // arg is the window title, the second is the item to open.
      cmd = "cmd.exe";
      args = ["/c", "start", "", resolved];
    } else {
      cmd = "xdg-open"; // opens files with their default app, folders w/ FM
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
