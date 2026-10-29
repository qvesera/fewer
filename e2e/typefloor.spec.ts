import { test, expect, type Page } from "@playwright/test";

/**
 * Type-floor guard for T-214 / issue #513: 11px is the smallest text the UI is
 * allowed to render, and every size is rem-based so --ui-scale can move it.
 * This fails the moment anyone reintroduces a `text-[9px]` (or any inline /
 * stylesheet size) below the floor — which is exactly how the UI got unreadable
 * on a large screen in the first place.
 */

const FLOOR = 11;

interface TinyText {
  size: number;
  text: string;
  cls: string;
}

/** Every text-bearing element under a selector whose computed font-size is
 *  below the floor. The scope defaults to the whole document, which also covers
 *  dialog portals (Radix renders them at document.body). */
async function textUnderFloor(page: Page, selector = "body"): Promise<TinyText[]> {
  return page.evaluate(
    ({ sel, floor }) => {
      const root = document.querySelector(sel) ?? document.body;
      const tiny: { size: number; text: string; cls: string }[] = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        const tag = el.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") continue;
        // Only elements with their own text node: a wrapper's inherited size is
        // already measured on the leaf that actually paints the characters.
        const ownText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim(),
        );
        if (!ownText) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size + 0.01 < floor) {
          tiny.push({ size, text: (el.textContent ?? "").trim().slice(0, 48), cls: String(el.className).slice(0, 96) });
        }
      }
      return tiny;
    },
    { sel: selector, floor: FLOOR },
  );
}

const expectNoTinyText = (found: TinyText[]) => {
  expect(
    found.map((f) => `${f.size}px ${JSON.stringify(f.text)} (${f.cls})`),
    "text below the 11px floor",
  ).toEqual([]);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fewer-tutorial-dismissed", "true");
    localStorage.setItem("fewer-tutorial-beginner-done", JSON.stringify([]));
  });
});

test("the app shell and canvas render no text below 11px", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Load Sample" }).first().click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15000 });
  expectNoTinyText(await textUnderFloor(page));
});

test("the Settings dialog renders no text below 11px", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Load Sample" }).first().click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15000 });
  await page.locator('[title="Settings"]').click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  expectNoTinyText(await textUnderFloor(page));
});

// The tab strip is one non-wrapping row: at the 12px floor five tabs measure
// ~485px, which only fits because the dialog is 600px wide (DialogContent's
// base sm:max-w-lg caps it at 512 otherwise — the reason this is pinned).
test("every Settings tab fits without scrolling the strip", async ({ page }) => {
  await page.goto("/app");
  await page.locator('[title="Settings"]').click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500); // let the zoom-in-95 open animation settle
  const fit = await page.evaluate(() => {
    const list = document.querySelector('[role="tablist"]') as HTMLElement | null;
    return list ? { scroll: list.scrollWidth, client: list.clientWidth } : null;
  });
  expect(fit, "tab strip missing").not.toBeNull();
  expect(fit!.scroll, "tab strip scrolls — dialog too narrow").toBeLessThanOrEqual(fit!.client);
});

// T-216: the Interface Scale control writes --ui-scale on <html> (root font-size
// follows), and Auto removes it so the viewport media queries decide again. The
// viewport below 2000px means Auto resolves to 16px.
test("the Interface Scale control drives --ui-scale and Auto hands back to the media queries", async ({ page }) => {
  await page.goto("/app");
  await page.locator('[title="Settings"]').click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.getByRole("tab", { name: "Appearance" }).click();

  const scaleVar = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--ui-scale"));
  const rootFontSize = () =>
    page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

  expect(await scaleVar(), "Auto must not pin the variable").toBe("");
  expect(await rootFontSize()).toBe(16);

  await page.getByRole("button", { name: "150%" }).click();
  await expect.poll(scaleVar).toBe("1.5");
  expect(await rootFontSize()).toBe(24); // 16px × 1.5

  await page.getByRole("button", { name: "Auto" }).click();
  await expect.poll(scaleVar).toBe("");
  expect(await rootFontSize()).toBe(16);
});
