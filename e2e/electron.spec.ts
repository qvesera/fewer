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
    // Back to the app (the docs test left us on /docs/getting-started).
    await window.goto("app://fewer/app.html");
    await expect
      .poll(() => window.title().then((t) => t.toLowerCase()), { timeout: 30_000 })
      .toContain("fewer");

    // Settings → Help → Report an Issue opens the shared dialog.
    await window.locator('button[title="Settings"]').click();
    await window.getByRole("tab", { name: "Help" }).click();
    await window.getByRole("button", { name: "Report an Issue" }).click();
    await expect(window.getByRole("dialog")).toContainText("Report a Bug");

    // Submit: the pre-filled issue opens in the SYSTEM browser (window.open →
    // main.ts setWindowOpenHandler → shell.openExternal) — the shell window
    // itself must never navigate away.
    await window.fill("#bug-title", "Shell smoke: GitHub bug report");
    await window.getByRole("button", { name: "Submit to GitHub" }).click();
    await expect(window.locator("text=GitHub pre-filled!")).toBeVisible();
    expect(await window.url()).toContain("app.html");
    // The Web3Forms email fallback is web-only: cloudFeature("bugEmail") is
    // OFF in the shell, so no email button ever appears.
    expect(await window.locator("text=Send via Email").count()).toBe(0);

    await window.getByRole("button", { name: "Cancel" }).click();

    // Export Settings downloads a fewer* localStorage snapshot and confirms.
    await window.getByRole("button", { name: "Export Settings" }).click();
    await expect(window.locator("text=Settings exported")).toBeVisible();
  });
});
