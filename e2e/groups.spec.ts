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
  return { frame, cards: [a, b] };
}

const groupHeader = (page: Page) => page.locator("[data-group-header]").first();

test("Group N Items from the selection menu draws a frame around the cards", async ({ page }) => {
  await openCanvas(page);
  await createGroup(page);
  await expect(page.locator("[data-group-id]")).toHaveCount(1);
});

test("header click selects the group, dragging it moves the cards in one undo step", async ({ page }) => {
  await openCanvas(page);
  const { frame, cards } = await createGroup(page);
  // Settle: wait for the frame to paint before sampling any geometry, so the
  // "before" coordinates are the true start (not a stale/partial layout).
  await expect(frame).toBeVisible();
  await page.waitForTimeout(300);
  const beforeFrame = (await frame.boundingBox())!;
  const beforeCard = (await cards[0].boundingBox())!;

  // Click the header → the frame rings as selected (T-135).
  const headerBox = (await groupHeader(page).boundingBox())!;
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await expect(frame).toHaveAttribute("data-selected", "true");

  // Drag the header: every member card travels with it.
  await page.mouse.move(headerBox.x + 40, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + 180, headerBox.y + headerBox.height / 2, { steps: 10 });
  await page.mouse.up();
  const afterFrame = (await frame.boundingBox())!;
  const afterCard = (await cards[0].boundingBox())!;
  expect(afterFrame.x - beforeFrame.x).toBeGreaterThan(100);
  expect(afterCard.x - beforeCard.x).toBeGreaterThan(100);

  // ONE undo restores the whole cluster.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.abs((await frame.boundingBox())!.x - beforeFrame.x)).toBeLessThan(2);
});

test("dragging a corner handle scales the group; one undo restores it", async ({ page }) => {
  await openCanvas(page);
  const { frame, cards } = await createGroup(page);
  await expect(frame).toBeVisible();
  await page.waitForTimeout(300);

  // Select the group → the frame grows eight resize handles (T-136).
  const headerBox = (await groupHeader(page).boundingBox())!;
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await expect(frame).toHaveAttribute("data-selected", "true");
  const handle = page.locator('[data-group-handle="se"]');
  await expect(handle).toBeVisible();

  // The distance between the two member cards is the scale — it must grow.
  const cardStart = (await cards[0].boundingBox())!;
  const gapBefore = (await cards[1].boundingBox())!.x - cardStart.x;
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 160, hb.y + hb.height / 2 + 100, { steps: 10 });
  await page.mouse.up();
  const gapAfter = (await cards[1].boundingBox())!.x - (await cards[0].boundingBox())!.x;
  expect(gapAfter).toBeGreaterThan(gapBefore * 1.2);

  // ONE undo restores the arrangement (cards keep their size throughout).
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.abs((await cards[0].boundingBox())!.x - cardStart.x)).toBeLessThan(4);
});

test("frame hugs the painted cards after a layout re-derive (Ctrl+L direction cycle)", async ({ page }) => {
  await openCanvas(page);
  const { frame, cards } = await createGroup(page);
  await expect(frame).toBeVisible();
  await page.waitForTimeout(300);

  // Cycle the layout direction: the canvas now DERIVES its own arrangement
  // (needsLayoutDerivation), so the painted coords stop being the shared store
  // coords. The frame must measure the painted array, not the stale store one
  // — the last sizing bug (T-138).
  await page.keyboard.press("Control+l");
  await expect.poll(async () => (await frame.boundingBox()) !== null).toBeTruthy();
  await page.waitForTimeout(400);

  const fb = (await frame.boundingBox())!;
  const a = (await cards[0].boundingBox())!;
  const b = (await cards[1].boundingBox())!;
  // Union of the two painted cards, inflated by padding+header — the frame's
  // top edge sits above the cards (header), its left edge within ~30px of the
  // leftmost card, and it contains both.
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  expect(fb.x).toBeGreaterThan(left - 40);
  expect(fb.x).toBeLessThan(left + 2);
  expect(fb.x + fb.width).toBeGreaterThan(right - 2);
  expect(fb.x + fb.width).toBeLessThan(right + 40);
  expect(fb.y).toBeLessThan(top + 2);
  expect(fb.y + fb.height).toBeGreaterThan(bottom - 2);
  expect(fb.y + fb.height).toBeLessThan(bottom + 45);
});

test("Delete on a selected group ungroups it, keeping the cards", async ({ page }) => {
  await openCanvas(page);
  const { frame, cards } = await createGroup(page);
  const headerBox = (await groupHeader(page).boundingBox())!;
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await expect(frame).toHaveAttribute("data-selected", "true");

  await page.keyboard.press("Delete");
  await expect(page.locator("[data-group-id]")).toHaveCount(0);
  // The cards survive the frame.
  await expect(cards[0]).toBeVisible();
  await expect(cards[1]).toBeVisible();
});

test("header buttons work after selecting: collapse, expand, ungroup (T-137)", async ({ page }) => {
  await openCanvas(page);
  const { frame, cards } = await createGroup(page);
  await expect(frame).toBeVisible();

  // Pressing the header (to select) must not steal the click from the buttons
  // inside it — pointerdown-era capture retargeted the click to the header and
  // killed chevron/note/× in every real browser (T-137).
  const headerBox = (await groupHeader(page).boundingBox())!;
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await expect(frame).toHaveAttribute("data-selected", "true");

  await page.getByRole("button", { name: "Collapse group" }).click();
  await expect(cards[0]).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand group" })).toBeVisible();

  await page.getByRole("button", { name: "Expand group" }).click();
  await expect(cards[0]).toBeVisible();

  await page.getByRole("button", { name: "Ungroup" }).click();
  await expect(page.locator("[data-group-id]")).toHaveCount(0);
  await expect(cards[0]).toBeVisible();
});

test("after a card drag (per-view map), the group moves the CARDS with the frame (T-137)", async ({ page }) => {
  await openCanvas(page);
  // Drag a card FIRST — that seeds this canvas's per-view positions map, the
  // exact state where the old gesture wrote invisible shared coords: the frame
  // slid away while the cards stayed put.
  const cards0 = (await standaloneCards(page))[0];
  const cb = (await cards0.boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 10);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 60, cb.y + 40, { steps: 6 });
  await page.mouse.up();

  const { frame, cards } = await createGroup(page);
  await expect(frame).toBeVisible();
  await page.waitForTimeout(300);
  const before0 = (await cards[0].boundingBox())!;
  const before1 = (await cards[1].boundingBox())!;

  const headerBox = (await groupHeader(page).boundingBox())!;
  await page.mouse.move(headerBox.x + 40, headerBox.y + headerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + 140, headerBox.y + headerBox.height / 2, { steps: 8 });
  await page.mouse.up();

  // The cards themselves travel — not just the frame (distance scales with
  // the canvas zoom, so assert direction + substance, not an exact figure).
  const after0 = (await cards[0].boundingBox())!;
  const after1 = (await cards[1].boundingBox())!;
  expect(after0.x - before0.x).toBeGreaterThan(20);
  expect(after1.x - before1.x).toBeGreaterThan(20);
  // Frame and cards stay glued (frame's left edge still inside the cluster).
  const fb = (await frame.boundingBox())!;
  expect(fb.x).toBeLessThan(after0.x);
  expect(fb.x + fb.width).toBeGreaterThan(after1.x + after1.width - 4);

  // ONE undo restores the arrangement.
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.abs((await cards[0].boundingBox())!.x - before0.x)).toBeLessThan(3);
});

test("hiding every member removes the frame; Show All brings it back", async ({ page }) => {
  await openCanvas(page);
  const { cards } = await createGroup(page);
  await expect(cards[0]).toBeVisible();

  // Re-select the two members (using the menu can clear the selection), then H
  // hides them. The frame must follow what the canvas paints: with no member
  // visible there is nothing to frame (T-134).
  await cards[0].click();
  await cards[1].click({ modifiers: ["Shift"] });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await page.keyboard.press("H");
  await expect(page.locator("[data-group-id]")).toHaveCount(0);

  // Recovery stays obvious: Show All restores every card and the frame with it.
  await page.keyboard.press("Shift+H");
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

