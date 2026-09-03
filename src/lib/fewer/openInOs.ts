// Server-only helper: open a resolved absolute path in the OS default app /
// file manager. Used by the /api/open-folder and /api/open-file route handlers.
// This runs on the machine hosting the dev server (a "local dev helper").
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

/**
 * Directories never descended into by the fallback filesystem search — they're
 * huge, vendored, or OS-internal, and never contain a user-imported project.
 */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".cache", ".config", ".local",
  ".npm", ".cargo", ".rustup", "Library", "AppData", "__pycache__",
  ".venv", "venv", "dist", "build", "target", "vendor",
]);

/** Max directories the fallback search visits before giving up. */
const DEFAULT_SEARCH_BUDGET = 3000;

/** Max depth the fallback search descends below each root. */
const MAX_SEARCH_DEPTH = 5;

export interface ResolveLocalPathOptions {
  /**
   * Base directories to search. Defaults to the app's sibling dir, the app
   * root, the user's home, and the common user folders (Downloads, Desktop,
   * Documents). Tests pass their own fixture roots.
   */
  roots?: string[];
  /** Max directories visited by the fallback search (default 3000). */
  searchBudget?: number;
}

function defaultRoots(): string[] {
  const cwd = process.cwd();
  const home = os.homedir();
  return [
    path.dirname(cwd),
    cwd,
    home,
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
  ];
}

/**
 * Walk `segments` down from `base`, matching each entry case-insensitively
 * (macOS/Windows filesystems are case-insensitive; saved graphs may also carry
 * stale casing). Returns the real on-disk path, or null on any miss.
 */
function resolveCaseless(base: string, segments: string[]): string | null {
  let cur = base;
  for (const seg of segments) {
    let entries: string[];
    try {
      entries = fs.readdirSync(cur);
    } catch {
      return null;
    }
    const want = seg.normalize("NFC").toLowerCase();
    const hit = entries.find((e) => e.normalize("NFC").toLowerCase() === want);
    if (!hit) return null;
    cur = path.join(cur, hit);
  }
  return cur;
}

/**
 * Normalize separators so Windows-style paths resolve on any platform, and
 * expand `~` like a shell would.
 */
function expandUserPath(rawPath: string): string {
  const rel = rawPath.replace(/\\/g, "/");
  return rel.startsWith("~/") ? path.join(os.homedir(), rel.slice(2)) : rel;
}

/**
 * Resolve a node's `data.path` to a real absolute path on this machine.
 *
 * The browser never exposes the absolute location of a user-picked folder
 * (`showDirectoryPicker` returns an opaque handle), so a directory import only
 * stores the folder's name/hierarchy (e.g. `test_csv_import` or
 * `ssy-react/src/logic`). Resolution strategy, cross-platform:
 *
 *   1. absolute paths (incl. `~`-relative) are verified as-is
 *   2. exact match under each root: app sibling, app root, home,
 *      Downloads, Desktop, Documents
 *   3. case-insensitive match under each root (Windows/macOS casing)
 *   4. budgeted breadth-first search below the roots, skipping vendored /
 *      OS-internal dirs, with exact + case-insensitive matching at every level
 *
 * Returns null when nothing matches — callers translate that to a 404.
 */
export async function resolveLocalPath(
  rawPath: string,
  opts: ResolveLocalPathOptions = {},
): Promise<string | null> {
  const expanded = expandUserPath(rawPath);
  const segments = expanded.split("/").filter(Boolean);

  if (path.isAbsolute(expanded)) {
    const p = path.resolve(expanded);
    return fs.existsSync(p) ? p : null;
  }
  if (!segments.length) return null;

  const roots = [...new Set(opts.roots ?? defaultRoots())].filter((r) =>
    fs.existsSync(r),
  );

  // Fast path: exact and case-insensitive match directly under each root.
  for (const root of roots) {
    const exact = path.resolve(root, expanded);
    if (fs.existsSync(exact)) return exact;
    const ci = resolveCaseless(root, segments);
    if (ci) return ci;
  }

  // Fallback: bounded BFS below the roots. At every visited dir, the imported
  // path must start with one of its entries, so check the first segment
  // (case-insensitively) against the listing we already have and descend the
  // rest with resolveCaseless when it matches.
  const budget = opts.searchBudget ?? DEFAULT_SEARCH_BUDGET;
  let visited = 0;
  const queue: Array<{ dir: string; depth: number }> = roots.map((r) => ({
    dir: r,
    depth: 0,
  }));
  const seen = new Set(roots);
  while (queue.length && visited < budget) {
    const { dir, depth } = queue.shift()!;
    visited++;
    const exact = path.resolve(dir, expanded);
    if (fs.existsSync(exact)) return exact;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const want = segments[0].normalize("NFC").toLowerCase();
    for (const e of entries) {
      if (e.name.normalize("NFC").toLowerCase() === want) {
        if (segments.length === 1) return path.join(dir, e.name);
        const ci = resolveCaseless(path.join(dir, e.name), segments.slice(1));
        if (ci) return ci;
      }
    }
    if (depth >= MAX_SEARCH_DEPTH) continue;
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
      const child = path.join(dir, e.name);
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push({ dir: child, depth: depth + 1 });
    }
  }
  return null;
}

export function requireLocalhost(request: Request): Response | null {
  let hostname: string;
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    hostname = "";
  }
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";
  if (!isLocal) {
    return Response.json(
      {
        error:
          "This endpoint is only accessible from the machine running the server (localhost). " +
          "Remote clients cannot open files or folders on the server.",
      },
      { status: 403 },
    );
  }
  return null;
}

export function openInOs(resolved: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const target = path.resolve(resolved); // normalize separators (win `\\`)
    let cmd: string;
    let args: string[];

    if (platform === "darwin") {
      cmd = "open";
      args = [target]; // opens both files (default app) and folders
    } else if (platform === "win32") {
      // `explorer <path>` doesn't strip quotes from its own argument, so route
      // through cmd's `start` built-in: `start "" "<path>"` — the empty quoted
      // arg is the window title, the second is the item to open. ComSpec is
      // the guaranteed-absolute location of cmd.exe.
      cmd = process.env.ComSpec ?? "cmd.exe";
      args = ["/c", "start", "", target];
    } else {
      cmd = "xdg-open"; // opens files with their default app, folders w/ FM
      args = [target];
    }

    const child = spawn(cmd, args, {
      shell: false,
      windowsHide: true, // don't flash a console window on Windows
    });
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
