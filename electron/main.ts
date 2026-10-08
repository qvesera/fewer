// Electron main process (T-095) — the desktop shell core.
//
// Serves the static export (`out/`, produced by `bun run build:desktop`) over a
// privileged `app://` protocol so Next's absolute `/_next/...` asset URLs
// resolve; `file://` cannot (absolute paths would hit the filesystem root).
// Feature/dev iteration can point at the Next dev server instead via
// FEWER_DEV_SERVER_URL (see AGENTS.md → Desktop shell).
//
// IPC: one channel ("fewer:invoke") → handlers.ts dispatch — the same command
// names/shapes as the Rust host (src-tauri/src/lib.rs).

import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createDispatch } from "./handlers";

// `out/` sits at the repo root: this file compiles to electron/dist/main.js.
const OUT_DIR = path.resolve(__dirname, "..", "..", "out");

// Must run before app ready — the scheme's privileges are fixed at startup.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;

function resolveExport(pathname: string): string | null {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const base = path.resolve(OUT_DIR, rel === "" ? "index.html" : rel);
  // Path traversal guard: never serve outside out/.
  if (base !== OUT_DIR && !base.startsWith(OUT_DIR + path.sep)) return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  // Directory-style route → exported sibling .html (Next `output: "export"`
  // emits app.html, docs/shortcuts.html, …), else index.html inside the dir.
  const asHtml = `${base}.html`;
  if (existsSync(asHtml)) return asHtml;
  const withIndex = path.join(base, "index.html");
  if (existsSync(withIndex)) return withIndex;
  return null;
}

// Content types for the export's static assets (net.fetch cannot read file://
// URLs through a custom protocol — verified live, T-095 — so the handler reads
// files itself and builds the Response).
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

async function fileResponse(file: string, status = 200): Promise<Response> {
  const body = await readFile(file);
  return new Response(new Uint8Array(body), {
    status,
    headers: { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" },
  });
}

function registerProtocol(): void {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    const file = resolveExport(url.pathname);
    if (file) return fileResponse(file);
    const notFound = path.join(OUT_DIR, "404.html");
    if (existsSync(notFound)) return fileResponse(notFound, 404);
    return new Response("Not found", { status: 404 });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Fewer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServer = process.env.FEWER_DEV_SERVER_URL;
  if (devServer) {
    // Dev loop: Next dev server (HMR) instead of the static export.
    void mainWindow.loadURL(devServer);
    mainWindow.webContents.openDevTools();
  } else {
    if (!existsSync(path.join(OUT_DIR, "index.html"))) {
      throw new Error(
        `static export not found at ${OUT_DIR} — run \`bun run build:desktop\` first (T-092)`,
      );
    }
    // Standalone (T-099): land directly in the app — the marketing homepage
    // exists for the web only.
    void mainWindow.loadURL("app://fewer/app.html");
  }

  // External links (http/https) open in the system browser — never in an
  // Electron popup window. Everything else (blank targets, odd schemes) denied.
  // openExternal can reject (no browser handler — headless CI, kiosk images);
  // swallow it so a failed hand-off never tears down the main process (T-105:
  // the bug report's "Submit to GitHub" rides this path).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  // Standalone (T-099 follow-up): the export also contains the marketing pages,
  // but the app never navigates to them — only /app (canvas) and /docs (kept
  // in-app per product) may load as documents. Client-side routing (pushState)
  // never fires this; it catches real document loads only (links, redirects).
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://")) return; // dev server: iterate freely
    const path = new URL(url).pathname;
    if (!path.startsWith("/app") && !path.startsWith("/docs")) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Dialogs + shell ops need a parent window (and must stay async — a sync
// handler would block the main thread, the T-091 lesson from the Tauri host).
const dispatch = createDispatch({
  dialogs: {
    async pickDirectory() {
      const r = mainWindow
        ? await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] })
        : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    async pickFile() {
      const r = mainWindow
        ? await dialog.showOpenDialog(mainWindow, { properties: ["openFile"] })
        : await dialog.showOpenDialog({ properties: ["openFile"] });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
  },
  shell: {
    async openPath(p: string) {
      const err = await shell.openPath(p);
      if (err) throw new Error(err);
    },
    async defaultLibraryDir() {
      // T-101: first-run default — ~/Documents/fewer, created on demand.
      const dir = path.join(app.getPath("documents"), "fewer");
      await mkdir(dir, { recursive: true });
      return dir;
    },
    async fetchText(url: string) {
      // T-102: main-process GET — no CORS, 10s timeout, 10MB cap. UA set here
      // because the renderer cannot (forbidden header).
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "fewer-app" },
      });
      const body = await res.text();
      if (body.length > 10 * 1024 * 1024) throw new Error("host_fetch: response too large (>10MB)");
      return { status: res.status, body };
    },
  },
});

ipcMain.handle("fewer:invoke", (_event, cmd: string, args?: Record<string, unknown>) =>
  dispatch(cmd, args ?? {}),
);

app.whenReady().then(() => {
  registerProtocol();
  createWindow();
  app.on("activate", () => {
    // macOS convention; harmless elsewhere.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
