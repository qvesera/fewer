import { test, expect, type Page } from "@playwright/test";

/**
 * Canvas groups, end to end (T-132): create a group from a selection, then the
 * two menu actions that shipped broken — Select Members and Color…. These run
 * in a real browser against the production build, which is the only place the
 * popover's anchoring (Radix Popper needs an anchor; this one is opened by a
 * menu item, not a trigger) can actually be verified.
 */

async function openCanvas(page: Page) {
  // tier=free: group CREATION is gated on the nodeGroups feature key (MIN_TIER
  // free — signed-out guests are excluded, per the tiers invariant), and an e2e
  // context is always signed out. The shell is never a guest.
  await page.goto("/app?tier=free");
  await page.getByRole("button", { name: "Load Sample" }).first().click();
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15000 });
}

// The tutorial auto-opens on first visit and its overlay blocks clicks — same
// suppression app.spec.ts uses (the dialog mounts a beat after the page, so it
// lands between steps otherwise).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fewer-tutorial-dismissed", "true");
    localStorage.setItem("fewer-tutorial-beginner-done", JSON.stringify([]));
  });
});

/** Two standalone cards to group. Child rows are also `.react-flow__node` but
 *  are drawn INSIDE their parent card (13px tall) and their centres are covered
 *  by the parent's DOM, so pick real cards by height — as app.spec.ts does by
 *  matching headers instead of nth(). */
async function standaloneCards(page: Page) {
  const ids = await page.locator(".react-flow__node").evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).getBoundingClientRect().height > 40)
      .slice(0, 2)
      .map((e) => (e as HTMLElement).dataset.id),
  );
  expect(ids).toHaveLength(2);
  return ids.map((id) => page.locator(`[data-id="${id}"]`));
}

/** Select two cards and create a group from the multi-selection menu. */
async function createGroup(page: Page) {
  const [a, b] = await standaloneCards(page);
  await a.click();
  await b.click({ modifiers: ["Shift"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);

  // Right-click a selected card → selection menu → More Actions → Group.
  // Coordinate click at the header, the way app.spec.ts opens card menus: a
  // locator click retries forever when any child row overlaps the centre, and
  // holding Shift changes how React Flow routes the right-click.
  const bBox = (await b.boundingBox())!;
  await page.mouse.click(bBox.x + bBox.width / 2, bBox.y + 10, { button: "right" });
  await page.getByRole("menuitem", { name: "More Actions" }).hover();
  await page.getByRole("menuitem", { name: /^Group \d+ Items$/ }).click();

  const frame = page.locator("[data-group-id]").first();
  await expect(frame).toBeVisible({ timeout: 10000 });
  return frame;
}

const groupHeader = (page: Page) => page.locator("[data-group-header]").first();

test("Group N Items from the selection menu draws a frame around the cards", async ({ page }) => {
  await openCanvas(page);
  await createGroup(page);
  await expect(page.locator("[data-group-id]")).toHaveCount(1);
});

test("group menu: Select Members selects the cards", async ({ page }) => {
  await openCanvas(page);
  await createGroup(page);

  await groupHeader(page).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Select Members" }).click();

  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
});

test("group menu: Color… opens an anchored, on-screen color picker", async ({ page }) => {
  await openCanvas(page);
  await createGroup(page);

  const headerBox = await groupHeader(page).boundingBox();

  await groupHeader(page).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Color…" }).click();

  const hex = page.getByLabel("Group color hex value");
  await expect(hex).toBeVisible({ timeout: 5000 });

  // Radix Popper positions an anchored layer with a translate() transform; the
  // menu-opened popover has no trigger, so without PopoverAnchor this is empty
  // and the layer lands wherever the browser puts an unpositioned fixed layer.
  const content = page.locator('[data-slot="popover-content"]').first();
  await expect(content).toBeVisible();

  // Radix writes the position on the popper WRAPPER (the content itself only
  // carries the CSS vars), and it is driven by the PopoverAnchor — without the
  // anchor the layer lands unpositioned instead of on the group.
  const wrapperTransform = await page
    .locator("[data-radix-popper-content-wrapper]")
    .first()
    .evaluate((el) => (el as HTMLElement).style.transform);
  expect(wrapperTransform).toMatch(/translate\(\s*[\d.]+px,\s*[\d.]+px\s*\)/);

  // On screen, sized like a picker, and anchored to the group it belongs to.
  const box = (await content.boundingBox())!;
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(100);
  expect(headerBox).not.toBeNull();
  expect(Math.abs(box.x - headerBox!.x)).toBeLessThan(80);
  expect(box.y).toBeGreaterThanOrEqual(headerBox!.y);
});
