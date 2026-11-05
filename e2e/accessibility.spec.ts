import { test, expect, type Page } from "@playwright/test";

/** Accessibility tab guards (T-215 / #514): the tab is never gated, the
 *  switches write their class on <html>, and a chosen preference survives a
 *  reload — which exercises the pre-paint init script in layout.tsx. */

async function openSettings(page: Page, tab: string) {
  await page.addInitScript(() => {
    localStorage.setItem("fewer-tutorial-dismissed", "true");
    localStorage.setItem("fewer-tutorial-beginner-done", JSON.stringify([]));
  });
  await page.goto("/app");
  await page.locator('[title="Settings"]').click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });
  await page.getByRole("tab", { name: tab }).click();
}

const hasClass = (page: Page, cls: string) =>
  page.evaluate((c) => document.documentElement.classList.contains(c), cls);

test("the Accessibility tab exposes every switch and gates none of them", async ({ page }) => {
  await openSettings(page, "Accessibility");
  for (const name of [
    "High contrast",
    "Solid surfaces",
    "Colour-blind-safe tag palette",
    "Show tag initials",
    "Reduce motion",
    "Larger hit targets",
    "Stronger focus ring",
  ]) {
    await expect(page.getByRole("switch", { name })).toBeVisible();
  }
  // Interface scale moved here from Appearance — it is a legibility control.
  await expect(page.getByRole("button", { name: "150%" })).toBeVisible();
});

test("switches write their class on <html>, and a choice survives a reload", async ({ page }) => {
  await openSettings(page, "Accessibility");

  const contrast = page.getByRole("switch", { name: "High contrast" });
  await contrast.click();
  await expect.poll(() => hasClass(page, "a11y-contrast")).toBe(true);

  await page.getByRole("switch", { name: "Reduce motion" }).click();
  await expect.poll(() => hasClass(page, "a11y-reduce-motion")).toBe(true);

  // Settings are debounced (1200ms) into localStorage; the init script has to
  // re-apply the classes before the first paint after a reload.
  await page.waitForTimeout(1600);
  await page.reload();
  await page.waitForTimeout(500);
  expect(await hasClass(page, "a11y-contrast")).toBe(true);
  expect(await hasClass(page, "a11y-reduce-motion")).toBe(true);

  // Turning it back off removes it — applyA11yToDom clears its own set first.
  await page.locator('[title="Settings"]').click();
  await page.getByRole("dialog").waitFor({ timeout: 15000 });
  await page.getByRole("tab", { name: "Accessibility" }).click();
  await page.getByRole("switch", { name: "High contrast" }).click();
  await expect.poll(() => hasClass(page, "a11y-contrast")).toBe(false);
});

test("the canvas speaks the selected card", async ({ page }) => {
  // Same preconditions as e2e/typefloor: the tutorial otherwise covers the
  // toolbar and the sample never loads.
  await page.addInitScript(() => {
    localStorage.setItem("fewer-tutorial-dismissed", "true");
    localStorage.setItem("fewer-tutorial-beginner-done", JSON.stringify([]));
  });
  await page.goto("/app");
  const load = page.getByRole("button", { name: "Load Sample" }).first();
  // The toolbar button mounts disabled for a beat while the shell settles —
  // waiting for it beats clicking into a hang.
  await expect(load).toBeEnabled({ timeout: 15000 });
  await load.click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15000 });

  const status = page.locator('[role="status"][aria-live="polite"]');
  await expect(status).toHaveCount(1);

  // Select the `src` card by its header — the root also lists "src" as a child
  // row, so a bare hasText would land on the root card (the same trap the
  // e2e/app spec documents).
  const srcCard = page
    .locator(".react-flow__node")
    .filter({ has: page.locator(".text-sm.font-semibold", { hasText: /^src$/ }) });
  await expect(srcCard.first()).toBeVisible({ timeout: 10000 });
  await srcCard.first().click();
  await expect(status).not.toHaveText("", { timeout: 10000 });
  const said = await status.textContent();
  expect(said ?? "").toMatch(/src/);
  expect(said ?? "").toMatch(/level|top level/);
  expect(said ?? "").toMatch(/folder/);
});
