// On-device search index (T-200): names and paths of opened folders live in a
// SQLite database in the app's userData dir, queried through FTS5 (prefix)
// with a LIKE fallback for mid-word substrings. Electron 44 ships Node 24,
// whose `node:sqlite` includes FTS5 — verified, zero new dependencies. Bun has
// no node:sqlite, so the database handle and the walker's readdir are injected
// and the pure parts (skip list, query sanitising) are unit-tested there;
// real SQL is covered by the Electron smoke test.
//
// Bounded by design: only roots the user opened, skip list (node_modules, dot
// dirs, caches), 250k rows per root and 500k overall, names/paths only —
// never file contents.
import { promises as fs } from "node:fs";
import path from "node:path";

/** Hard row cap for one indexed root; the build stops and reports truncated. */
export const ROOT_ROW_CAP = 250_000;
/** Hard row cap for the whole index. */
export const TOTAL_ROW_CAP = 500_000;
export const DEFAULT_SEARCH_LIMIT = 50;

/** Directory names never walked. Dot-dirs are skipped separately. */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".next",
  ".nuxt",
  ".cache",
  ".gradle",
  ".idea",
  ".vscode",
  ".venv",
  "venv",
  "Library",
  "AppData",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

/** True when a directory must not be indexed (skip list + hidden dirs). */
export function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith(".");
}

/**
 * FTS5 match string for a user query: alphanumeric-ish tokens, each
 * prefix-matched, AND-ed. Anything that could read as FTS syntax is stripped
 * so a query like `foo(bar:*)` degrades to tokens instead of throwing.
 */
export function sanitizeFtsQuery(query: string): string {
  const tokens = query
    .replace(/["'()*:^~\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.map((t) => `"${t}"*`).join(" AND ");
}

/** LIKE pattern for the substring fallback (escaped % and _). */
export function likePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

/** LIKE pattern that matches names starting with the query (prefix rank). */
export function likePrefixPattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `${escaped}%`;
}

/** Minimal slice of the node:sqlite DatabaseSync surface we rely on. */
export interface IndexDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
}

export function ensureSchema(db: IndexDb): void {
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS files(" +
      "path TEXT PRIMARY KEY, root TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS files_root_idx ON files(root)");
  db.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(" +
      "name, path, content='files', content_rowid='rowid', tokenize='unicode61')",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS roots(root TEXT PRIMARY KEY, indexed_at TEXT NOT NULL, count INTEGER NOT NULL)",
  );
}

/** Remove a root's rows (and forget it); used before re-index and on purge. */
export function purgeRoot(db: IndexDb, root: string): number {
  const count = Number(db.prepare("SELECT COUNT(*) AS c FROM files WHERE root = ?1").get(root)?.c ?? 0);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM files_fts WHERE rowid IN (SELECT rowid FROM files WHERE root = ?1)").run(root);
    db.prepare("DELETE FROM files WHERE root = ?1").run(root);
    db.prepare("DELETE FROM roots WHERE root = ?1").run(root);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return count;
}

export interface IndexBuildResult {
  root: string;
  indexed: number;
  truncated: boolean;
  durationMs: number;
}

export interface WalkHooks {
  /** readdir for one directory; injected so tests drive the walk. */
  readdir(dir: string): Promise<Array<{ name: string; type: "folder" | "file" }>>;
}

/**
 * Walk `root` and (re)build its rows. Sequential BFS: one directory at a time
 * keeps memory flat regardless of tree width (the walk benchmark in the
 * native-shell spike measured ~655k entries/s this way in Node).
 */
export async function indexRoot(
  db: IndexDb,
  root: string,
  hooks: WalkHooks = { readdir: defaultReaddir },
): Promise<IndexBuildResult> {
  const started = Date.now();
  ensureSchema(db);
  purgeRoot(db, root);

  const totalNow = Number(db.prepare("SELECT COUNT(*) AS c FROM files").get()?.c ?? 0);
  const insert = db.prepare("INSERT OR REPLACE INTO files(path, root, name, type) VALUES(?1, ?2, ?3, ?4)");

  let indexed = 0;
  let truncated = false;
  const queue: string[] = [root];

  db.exec("BEGIN");
  try {
    while (queue.length && !truncated) {
      const dir = queue.shift()!;
      let entries: Array<{ name: string; type: "folder" | "file" }>;
      try {
        entries = await hooks.readdir(dir);
      } catch {
        continue; // unreadable dir (permissions, unmounted) — skip, keep going
      }
      for (const e of entries) {
        const full = joinPath(dir, e.name);
        if (totalNow + indexed >= TOTAL_ROW_CAP) {
          truncated = true;
          break;
        }
        insert.run(full, root, e.name, e.type);
        indexed++;
        if (e.type === "folder" && !shouldSkipDir(e.name)) queue.push(full);
        if (indexed >= ROOT_ROW_CAP) {
          truncated = true;
          break;
        }
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  // Keep the FTS index in sync with the content table (external-content
  // tables do not update themselves).
  db.exec("INSERT INTO files_fts(files_fts) VALUES('rebuild')");
  db.prepare(
    "INSERT INTO roots(root, indexed_at, count) VALUES(?1, ?2, ?3) " +
      "ON CONFLICT(root) DO UPDATE SET indexed_at = excluded.indexed_at, count = excluded.count",
  ).run(root, new Date().toISOString(), indexed);

  return { root, indexed, truncated, durationMs: Date.now() - started };
}

export interface DeviceHit {
  path: string;
  name: string;
  root: string;
  type: "folder" | "file";
}

function toHit(row: Record<string, unknown>): DeviceHit {
  return {
    path: String(row.path),
    name: String(row.name),
    root: String(row.root),
    type: row.type === "folder" ? "folder" : "file",
  };
}

/**
 * Query the index. FTS5 prefix match first; when it finds nothing (mid-word
 * substring, punctuation-heavy query) fall back to a LIKE scan — measured
 * ~13ms per 100k rows in the main process, debounced upstream.
 */
export function searchIndex(db: IndexDb, query: string, limit = DEFAULT_SEARCH_LIMIT): DeviceHit[] {
  const q = query.trim();
  if (!q) return [];
  ensureSchema(db);

  const ftsQuery = sanitizeFtsQuery(q);
  if (ftsQuery) {
    try {
      const rows = db
        .prepare(
          "SELECT f.path AS path, f.name AS name, f.root AS root, f.type AS type " +
            "FROM files_fts JOIN files f ON f.rowid = files_fts.rowid " +
            "WHERE files_fts MATCH ?1 ORDER BY rank LIMIT ?2",
        )
        .all(ftsQuery, limit);
      const hits = rows.map(toHit);
      if (hits.length) return hits;
    } catch {
      // Malformed FTS query — fall through to LIKE.
    }
  }

  const rows = db
    .prepare(
      "SELECT path, name, root, type FROM files " +
        "WHERE name LIKE ?1 ESCAPE '\\' OR path LIKE ?1 ESCAPE '\\' " +
        "ORDER BY CASE WHEN name = ?2 THEN 0 WHEN name LIKE ?3 ESCAPE '\\' THEN 1 ELSE 2 END, length(name) " +
        "LIMIT ?4",
    )
    .all(likePattern(q), q, likePrefixPattern(q), limit);
  return rows.map(toHit);
}

export interface IndexStats {
  total: number;
  roots: Array<{ root: string; count: number; indexedAt: string }>;
}

export function indexStats(db: IndexDb): IndexStats {
  ensureSchema(db);
  const total = Number(db.prepare("SELECT COUNT(*) AS c FROM files").get()?.c ?? 0);
  const roots = db
    .prepare("SELECT root, count, indexed_at AS indexedAt FROM roots ORDER BY indexed_at DESC")
    .all()
    .map((r) => ({ root: String(r.root), count: Number(r.count), indexedAt: String(r.indexedAt) }));
  return { total, roots };
}

/** posix-style join that keeps Windows drive letters intact. */
export function joinPath(base: string, name: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(base) || base.includes("\\")) {
    return base.endsWith("\\") || base.endsWith("/") ? base + name : `${base}\\${name}`;
  }
  return base.endsWith("/") ? base + name : `${base}/${name}`;
}

export async function defaultReaddir(dir: string): Promise<Array<{ name: string; type: "folder" | "file" }>> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  return dirents
    .filter((d) => d.isDirectory() || d.isFile())
    .map((d) => ({ name: d.name, type: d.isDirectory() ? ("folder" as const) : ("file" as const) }));
}

/** DB file size on disk (bytes), 0 when missing — surfaced in Settings. */
export async function indexDbBytes(dbPath: string): Promise<number> {
  try {
    return (await fs.stat(dbPath)).size;
  } catch {
    return 0;
  }
}

export function resolveDbPath(userDataDir: string): string {
  return path.join(userDataDir, "search-index.db");
}