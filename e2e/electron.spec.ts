// Electron smoke (T-097): launch the real desktop shell with Playwright's
// `_electron`, and prove the seam end-to-end in the packaged code path —
// renderer → `__FEWER_NATIVE__` bridge → ipcMain → handlers → Node fs.
//
// Prerequisites: `bun run build:desktop` (out/) + `bun run electron:compile`
// (electron/dist). The test skips itself when either is missing so the plain
// `bunx playwright test` web suite never breaks; run it headful-or-xvfb with:
//   bunx playwright test --config playwright.electron.config.ts
// CI wraps it in xvfb-run (package job in .github/workflows/ci.yml).

import { _electron as electron, expect, test } from "@playwright/test";
import electronPath from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const READY =
  existsSync(path.join(ROOT, "out", "index.html")) &&
  existsSync(path.join(ROOT, "electron", "dist", "main.js"));

test.describe("Electron shell", () => {
  test.skip(!READY, "needs out/ + electron/dist — run: bun run build:desktop && bun run electron:compile");

  test.setTimeout(120_000);
  let app: Awaited<ReturnType<typeof electron.launch>>;

  test.beforeAll(async () => {
    // args[0] = the app directory; package.json "main" resolves the compiled
    // shell (electron/dist/main.js), which serves out/ over app://.
    app = await electron.launch({
      // The electron npm package exports the BINARY PATH at runtime; its .d.ts
      // describes the API namespace instead — hence the cast.
      executablePath: electronPath as unknown as string,
      args: [ROOT],
      cwd: ROOT,
    });
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test("opens a window with the native bridge and working IPC", async () => {
    const window = await app.firstWindow();
    // Standalone entry (T-099): boots into the app route — never the marketing
    // homepage (the will-navigate guard in main.ts enforces it too).
    expect(window.url()).toContain("app.html");
    // The marketing page's title is "fewer | Turn any directory…" (lowercase).
    await expect
      .poll(() => window.title().then((t) => t.toLowerCase()), { timeout: 60_000 })
      .toContain("fewer");

    // The seam: preload exposes exactly the contract nativeShell.ts routes to.
    const hasBridge = await window.evaluate(() => "__FEWER_NATIVE__" in window);
    expect(hasBridge).toBe(true);

    // Real round-trip through preload → ipcMain → handlers → fs (read-only —
    // never invoke pickers here: a native dialog would wait for a human).
    const page = (await window.evaluate(() =>
      (window as unknown as {
        __FEWER_NATIVE__: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
      }).__FEWER_NATIVE__.invoke("list_dir", { path: "/", offset: 0, limit: 5 }),
    )) as { entries: Array<{ name: string; type: string }>; total: number };
    expect(page.total).toBeGreaterThan(0);
    expect(page.entries.length).toBeLessThanOrEqual(5);
    expect(page.entries[0]).toHaveProperty("type");

    // Unknown commands reject — parity with Tauri's invoke behaviour.
    await expect(
      window.evaluate(() =>
        (window as unknown as {
          __FEWER_NATIVE__: { invoke: (cmd: string) => Promise<unknown> };
        }).__FEWER_NATIVE__.invoke("bench_tree_json"),
      ),
    ).rejects.toThrow(/unknown command/);
  });

  test("application menu exists with the File/Edit/View/Window/Help sections (T-197)", async () => {
    // Menu lives in the main process — inspect it there, not in the DOM.
    const result = await app.evaluate((electronApp) => {
      const menu = electronApp.Menu.getApplicationMenu();
      const sections = menu ? menu.items.map((item) => item.label) : [];
      const file = menu ? menu.items.find((item) => item.label === "File") : null;
      const fileItems = file && file.submenu ? file.submenu.items.map((item) => item.label) : [];
      return { sections, fileItems };
    });
    // macOS puts Settings in the app menu; every platform still has these.
    for (const section of ["File", "Edit", "View", "Window", "Help"]) {
      expect(result.sections, `menu section ${section}`).toContain(section);
    }
    expect(result.fileItems).toContain("Open Folder…");
    expect(result.fileItems).toContain("Export…");
  });

  test("shell chrome: one compact header, no web navbar/toolbar (T-198)", async () => {
    const window = await app.firstWindow();
    await window.goto("app://fewer/app.html");
    await expect.poll(() => window.title(), { timeout: 30_000 }).toContain("fewer");
    // The shell swaps the web's GlobalNavbar + CanvasToolbar for one 44px bar.
    await expect(window.locator("header[data-shell-header]")).toBeVisible({ timeout: 30_000 });
    const height = await window.locator("header[data-shell-header]").evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.round(height)).toBe(44);
    // Web-only chrome and header buttons the native menu owns are gone.
    expect(await window.locator('button:has-text("Load Sample")').count()).toBe(0);
    expect(await window.locator('button:has-text("Export")').count()).toBe(0);
    expect(await window.locator('button[aria-label="Open settings"]').count()).toBe(0);
    // Search sits in the shell header (top right).
    expect(await window.locator("header[data-shell-header] input[data-search-input]").count()).toBe(1);
  });

  test("device search index: build, prefix + substring search, purge (T-200)", async () => {
    const window = await app.firstWindow();
    const invoke = async (cmd: string, args: Record<string, unknown>) =>
      window.evaluate(
        ({ c, a }: { c: string; a: Record<string, unknown> }) =>
          (window as unknown as {
            __FEWER_NATIVE__: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> };
          }).__FEWER_NATIVE__.invoke(c, a),
        { c: cmd, a: args },
      );

    // A throwaway folder — the index is real node:sqlite in the main process,
    // so this is the only place the FTS5 path is exercised end to end.
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const pth = await import("node:path");
    const dir = await fs.mkdtemp(pth.join(os.tmpdir(), "fewer-idx-"));
    await fs.mkdir(pth.join(dir, "src"));
    await fs.writeFile(pth.join(dir, "src", "alpha-note.txt"), "hi");

    const built = (await invoke("index_build", { root: dir })) as { indexed: number; truncated: boolean };
    expect(built.indexed).toBe(2); // src/ folder + alpha-note.txt
    expect(built.truncated).toBe(false);

    const prefix = (await invoke("index_search", { query: "alpha" })) as { hits: Array<{ path: string }> };
    expect(prefix.hits.some((h) => h.path.endsWith("alpha-note.txt"))).toBe(true);

    // Mid-word substring misses FTS prefix tokens and lands on the LIKE
    // fallback ("lpha-not" is contiguous inside "alpha-note.txt" but its
    // tokens are not prefixes of any indexed token pair).
    const substring = (await invoke("index_search", { query: "lpha-not" })) as { hits: Array<{ path: string }> };
    expect(substring.hits.some((h) => h.path.endsWith("alpha-note.txt"))).toBe(true);

    const purged = (await invoke("index_purge", { root: dir })) as { removed: number };
    expect(purged.removed).toBe(2);
    await fs.rm(dir, { recursive: true, force: true });
  });

  test("shell docs: no marketing header, no links to hidden pages (T-104)", async () => {
    const window = await app.firstWindow();
    // Direct load over app:// (the protocol maps /docs → out/docs.html; the
    // will-navigate guard allows /docs).
    await window.goto("app://fewer/docs");
    await expect.poll(() => window.title(), { timeout: 30_000 }).toContain("Docs");
    // Hydration runs MarketingLayout in the BROWSER (DocsLayout is a client
    // component) — wait for it, then assert the web chrome never appears.
    await window.waitForTimeout(2000);
    expect(await window.locator("header >> text=Launch the app").count()).toBe(0);
    expect(await window.locator("header nav >> text=Gallery").count()).toBe(0);
    expect(await window.locator("header nav >> text=Blog").count()).toBe(0);
    expect(await window.locator("header nav >> text=Privacy").count()).toBe(0);
    expect(await window.locator("header nav >> text=Docs").count()).toBe(1);

    // Article bodies must not link to pages the shell doesn't ship.
    await window.goto("app://fewer/docs/getting-started");
    await expect.poll(() => window.title(), { timeout: 30_000 }).toContain("Getting Started");
    await window.waitForTimeout(1500);
    for (const dead of ["/docs/accounts", "/docs/sharing", "/docs/deployment"]) {
      expect(await window.locator(`a[href="${dead}"]`).count(), `dead link ${dead}`).toBe(0);
    }
    // The desktop-only replacement section is present, sign-in section is not.
    expect(await window.locator("h2:has-text('In the Desktop App')").count()).toBe(1);
    expect(await window.locator("h2:has-text('Sign In (Optional)')").count()).toBe(0);
  });

  test("shell bug report via GitHub + settings export (T-105)", async () => {
    const window = await app.firstWindow();

    // Main-process hand-off: RECORD shell.openExternal instead of letting
    // xdg-open spawn an opener chain on CI — the chain inherits the runner's
    // stdout pipe and Playwright's app.close() then waits for an EOF that
    // never comes (mac/win spawn semantics don't hit this). We still assert
    // the exact forwarded URL, which is stronger than "a browser opened".
    await app.evaluate(({ shell }) => {
      const target = shell as unknown as {
        openExternal: (url: string) => Promise<void>;
        __orig?: unknown;
      };
      const g = globalThis as unknown as { __opened?: string[] };
      g.__opened = [];
      const before = target.openExternal;
      target.openExternal = async (url: string) => {
        g.__opened!.push(url);
      };
      if (target.openExternal === before) throw new Error("openExternal not patchable");
    });

    // The tutorial auto-opens on a fresh profile and its z-max overlay swallows
    // clicks (CI's runner profile is always fresh). Seed the dismissal key
    // BEFORE the app hydrates — init scripts run before page scripts.
    await window.addInitScript(() => {
      try {
        localStorage.setItem("fewer-tutorial-dismissed", "true");
      } catch {
        /* ignore */
      }
    });
    // Back to the app (the docs test left us on /docs/getting-started) and
    // wait for the shell chrome — it only appears once FewerApp has mounted,
    // which is also when the menu bridge starts listening.
    await window.goto("app://fewer/app.html");
    await expect(window.locator("header[data-shell-header]")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => window.title().then((t) => t.toLowerCase()), { timeout: 30_000 })
      .toContain("fewer");

    // Settings → Help → Report an Issue opens the shared dialog. T-198: the
    // shell header has no Settings button — the native application menu owns
    // it, so drive the real menu item from the main process.
    await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
        for (const item of items) {
          if (item.label === "Settings…") return item;
          const nested = item.submenu?.items;
          const hit = nested ? find(nested) : undefined;
          if (hit) return hit;
        }
        return undefined;
      };
      const settings = menu ? find(menu.items) : undefined;
      if (!settings?.click) throw new Error("Settings menu item missing");
      settings.click();
    });
    await expect(window.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    // T-148: the licensing rail ships OFF, so a packaged build offers no path
    // to Pro — no License tab, no activation flow, no upgrade copy.
    expect(await window.getByRole("tab", { name: "License" }).count()).toBe(0);
    await window.getByRole("tab", { name: "Help" }).click();
    await window.getByRole("button", { name: "Report an Issue" }).click();
    await expect(window.getByRole("dialog")).toContainText("Report a Bug");

    // Submit: the pre-filled issue opens in the SYSTEM browser (window.open →
    // main.ts setWindowOpenHandler → shell.openExternal) — the shell window
    // itself must never navigate away.
    await window.fill("#bug-title", "Shell smoke: GitHub bug report");
    await window.getByRole("button", { name: "Submit to GitHub" }).click();
    // .first(): the toast title and its aria-live announcement both match.
    await expect(window.locator("text=GitHub pre-filled!").first()).toBeVisible();
    expect(await window.url()).toContain("app.html");
    // The hand-off really reached main: openExternal got the pre-filled URL.
    const opened = await app.evaluate(
      () => (globalThis as unknown as { __opened: string[] }).__opened,
    );
    expect(
      opened.some((u) => u.startsWith("https://github.com/qvesera/fewer/issues/new")),
    ).toBe(true);
    // The Web3Forms email fallback is web-only: cloudFeature("bugEmail") is
    // OFF in the shell, so no email button ever appears.
    expect(await window.locator("text=Send via Email").count()).toBe(0);

    await window.getByRole("button", { name: "Cancel" }).click();

    // Export Settings downloads a fewer* localStorage snapshot and confirms.
    await window.getByRole("button", { name: "Export Settings" }).click();
    await expect(window.locator("text=Settings exported").first()).toBeVisible();
  });
});
