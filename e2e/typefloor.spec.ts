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

// The tab strip is one non-wrapping row, and the dialog is deliberately narrow:
// it matches the Import dialog's width (sm:max-w-xl, 36rem), leaving the strip
// ~526px of space. The strip is WIDER than that by design — six tabs ≈630px in
// Geist and up to eight ≈820px (T-221/T-238) — so it overflows and the far tabs
// are reached by scrolling horizontally (wheel, or the scrollbar). The test runs
// both the six-tab guest set and the eight-tab Pro set, pins the tab count so
// the tier override can't silently test the wrong set, and proves reachability:
// the strip overflows, wheel over it advances the scroll offset, and the last
// tab sits fully in view once scrolled to the end.
for (const [tier, expectedTabs] of [
  ["guest", 6],
  ["pro", 8],
] as const) {
  test(`Settings tab strip wheel-scrolls to every tab (${tier}, ${expectedTabs} tabs)`, async ({ page }) => {
    await page.goto(tier === "guest" ? "/app" : "/app?tier=pro");
    await page.locator('[title="Settings"]').click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500); // let the zoom-in-95 open animation settle
    const strip = page.locator('[role="tablist"]');
    await expect(strip, "tab strip missing").toHaveCount(1);
    const tabs = await strip.evaluate((el) => el.querySelectorAll('[role="tab"]').length);
    expect(tabs, `tier=${tier} should show ${expectedTabs} tabs`).toBe(expectedTabs);

    // The width must match the Import dialog: both pass sm:max-w-xl (36rem),
    // which at the default 16px root renders 576px wide (Import relies on the
    // base w-full + that same cap, so the two dialogs are identical here).
    const dialogW = await page.getByRole("dialog").evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(dialogW, "Settings width should match the Import dialog (36rem/576px)").toBe(576);

    // The dialog matches Import's width, so the strip (up to eight tabs ≈820px)
    // is WIDER than the dialog by design — reaching the far tabs scrolls.
    const overflows = await strip.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflows, "strip should overflow the narrow dialog by design").toBe(true);

    // Vertical wheel over the strip scrolls it HORIZONTALLY (the fix): start at
    // the left edge — INSTANTLY, since scroll-smooth animates a plain assignment —
    // wheel over the strip, then let the glide settle before reading the offset.
    await strip.evaluate((el) => el.scrollTo({ left: 0, behavior: "instant" }));
    const box = (await strip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(500); // scroll-smooth: let the wheel step glide
    const scrolled = await strip.evaluate((el) => el.scrollLeft);
    expect(scrolled, "wheel should scroll the strip horizontally").toBeGreaterThan(0);

    // …and every tab is reachable: scrolled to the end (instantly), the last tab
    // sits fully inside the strip's visible box.
    await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "instant" }));
    await page.waitForTimeout(100);
    const reachable = await strip.evaluate((el) => {
      const all = el.querySelectorAll<HTMLElement>('[role="tab"]');
      const last = all[all.length - 1];
      const s = el.getBoundingClientRect();
      const l = last.getBoundingClientRect();
      return l.right <= s.right + 1 && l.left >= s.left - 1;
    });
    expect(reachable, "last tab reachable by scrolling the strip").toBe(true);
  });
}

// T-216/T-215: the Interface Scale control lives in Accessibility and writes
// --ui-scale on <html> (root font-size follows); Auto removes it so the
// viewport media queries decide. Below 2000px wide that resolves to 16px.
test("the Interface Scale control drives --ui-scale and Auto hands back to the media queries", async ({ page }) => {
  await page.goto("/app");
  await page.locator('[title="Settings"]').click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10000 });
  await page.getByRole("tab", { name: "Accessibility" }).click();

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
