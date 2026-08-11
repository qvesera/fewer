// Server-only helper: open a resolved absolute path in the OS default app /
// file manager. Used by the /api/open-folder and /api/open-file route handlers.
// This runs on the machine hosting the dev server (a "local dev helper").
import { spawn } from "child_process";

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
