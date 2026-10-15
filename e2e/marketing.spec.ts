import { test, expect } from "@playwright/test";

/**
 * Marketing home page guards (T-149, T-150, hotspot follow-ups): the page makes
 * claims about the product, and those claims drift the way the changelog does -
 * the format count, the vocabulary, and the one canonical URL all silently went
 * stale before. Cheap assertions, one page load each.
 *
 * The feature copy lives in the playground's inspector, which shows one feature
 * at a time, so the copy guards below click the chip that shows a feature
 * first. The tour that walks those features on a timer is part of the page now,
 * so anything that asserts a specific feature parks it first - and the tour's
 * own guarantees (it moves, it stops when asked, it stays out of the way) have
 * tests of their own.
 */

/** Park the tour so an assertion cannot be raced by its next tick. */
async function parkTheTour(page: import("@playwright/test").Page) {
  await page.locator('[data-mk-tour="pause"]').click();
}

test("the home page states the current product", async ({ page }) => {
  await page.goto("/");
  // Waiting for the tour button is also waiting for hydration: the button is
  // server-rendered, but only the client decides whether it reads pause or
  // play, and a click that lands before that is a click into nothing.
  await parkTheTour(page);

  // The nav's Features link stays on the canonical page (it used to hop to
  // the duplicate at /welcome).
  await expect(page.getByRole("link", { name: "Features" })).toHaveAttribute(
    "href",
    "/#features",
  );

  // The h1 keeps the phrase the product is known by; the /welcome redirect
  // test below asserts it too.
  await expect(
    page.getByRole("heading", { level: 1, name: /interactive graph/i }),
  ).toBeVisible();

  // 8 export formats since the .fwr document shipped (T-145). Chips and cards
  // share a label by design, so the chip is addressed by its data attribute.
  await page.locator('[data-mk-chip="export"]').click();
  await expect(page.getByRole("heading", { level: 2, name: "Export in 8 formats" })).toBeVisible();
  await expect(page.getByText("Export in 7 formats")).toHaveCount(0);

  // Headline free feature, in the first story slot.
  await page.locator('[data-mk-chip="groups"]').click();
  await expect(page.getByRole("heading", { level: 2, name: "Canvas groups" })).toBeVisible();

  // App-wide vocabulary: cards, not nodes (T-136-era copy change).
  await page.locator('[data-mk-chip="keyboard"]').click();
  await expect(page.getByText("search across every card")).toBeVisible();
  await expect(page.getByText(/every node/)).toHaveCount(0);

  // Only GitHub URLs are actually recognised — the copy must not promise Git.
  await page.locator('[data-mk-chip="import"]').click();
  await expect(page.getByText("a GitHub repo")).toBeVisible();
});

test("the home page sits on the canvas dot grid", async ({ page }) => {
  await page.goto("/");

  // Same gap/size as the app canvas, and inert: it is a backdrop, not UI.
  await expect(page.locator(".mk-dotgrid")).toBeVisible();
  await expect(page.locator(".mk-backdrop")).toHaveAttribute("aria-hidden", "true");
});

test("the tree vs graph comparison switches views", async ({ page }) => {
  await page.goto("/");

  // Exactly one copy of the feature index on the page.
  await expect(
    page.locator('[role="region"][aria-label="Feature index"]'),
  ).toHaveCount(1);

  // Both panes stay mounted and stacked in one grid cell, so the container
  // height never jumps; the toggle only moves opacity. The hidden pane is
  // `invisible`, so it cannot be tabbed into.
  const treePane = page.locator("#compare pre");
  await page.getByRole("button", { name: "tree", exact: true }).click();
  await expect(treePane).toHaveCSS("opacity", "1");
  await expect(treePane).toContainText("└── Tags");

  await page.getByRole("button", { name: "fewer", exact: true }).click();
  await expect(page.locator("#compare [data-mk-node]").first()).toBeVisible();
});

test("the tree pane is the canvas's twin, not a stray text block", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();

  // The tree sits under its own caption, centred in the same box the canvas
  // occupies - it used to be a bare <pre> pinned to the left edge of a
  // full-bleed row, with the hidden graph's height left empty beside it.
  await page.getByRole("button", { name: "tree", exact: true }).click();
  const caption = page.getByText("The same folder, as text");
  await expect(caption).toBeVisible();

  const pre = page.locator("#compare pre");
  const captionBox = await caption.boundingBox();
  const preBox = await pre.boundingBox();
  const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
  // Centred as one block: the caption and the tree text share a centre line.
  expect(Math.abs(centre(preBox!) - centre(captionBox!))).toBeLessThan(4);
  // That line is the canvas's own axis - the twin, not a stray column beside it.
  const canvasBox = await page.locator("[data-mk-canvas]").boundingBox();
  expect(Math.abs(centre(preBox!) - centre(canvasBox!))).toBeLessThan(6);
  // And the block is inside the page container, not at the viewport edge.
  expect(preBox!.x).toBeGreaterThan(16);
});

test("a feature card reveals its feature, and only that card is ringed", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);

  // One marker on the canvas, never a dozen: the card whose id IS the
  // feature id wears the active ring, even before the reader engages - the
  // callout and the canvas always name the same thing.
  const ring = page.locator("[data-mk-node].mk-node-active");
  await expect(ring).toHaveCount(1);

  // Hovering a feature card shows exactly that feature in the callout, and
  // the ring follows - identity, not an anchor map.
  await page.locator('[data-mk-node="tags"]').hover();
  await expect(page.locator('[data-mk-callout="tags"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Colour-code any card" }),
  ).toBeVisible();
  await expect(ring).toHaveCount(1);
  await expect(page.locator('[data-mk-node="tags"].mk-node-active')).toHaveCount(1);

  // Folder cards are structure: hovering one changes nothing. Approach it from
  // off the cards, because a pointer swept between two cards legitimately
  // activates whatever it crosses - Playwright moves the mouse in steps, a
  // real mouse sweeps too - and the straight line from the tags card to this
  // folder passes over the Themes card, which would change the callout on the
  // way. The headline is above the canvas and has no activation handlers.
  await page.getByRole("heading", { level: 1, name: /interactive graph/i }).hover();
  await page.locator('[data-mk-node="connect"]').hover();
  await expect(page.locator('[data-mk-callout="tags"]')).toBeVisible();
  await expect(page.locator('[data-mk-node="tags"].mk-node-active')).toHaveCount(1);
});

test("the tour advances on its own, and the pause button stops it", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();

  const callout = page.locator("[data-mk-callout]");
  const first = await callout.getAttribute("data-mk-callout");

  // It walks the catalogue without being asked ...
  await expect
    .poll(async () => callout.getAttribute("data-mk-callout"), { timeout: 15000 })
    .not.toBe(first);

  // ... and stops for good the moment the reader parks it.
  await parkTheTour(page);
  const parked = await callout.getAttribute("data-mk-callout");
  await page.waitForTimeout(6500);
  await expect(callout).toHaveAttribute("data-mk-callout", parked!);
  await expect(page.locator('[data-mk-tour="play"]')).toBeVisible();
  // The canvas points at the same feature the whole time: one ring, on that card.
  await expect(page.locator("[data-mk-node].mk-node-active")).toHaveCount(1);
});

test("the tour never starts under prefers-reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();

  const callout = page.locator("[data-mk-callout]");
  const first = await callout.getAttribute("data-mk-callout");
  await page.waitForTimeout(6500);
  await expect(callout).toHaveAttribute("data-mk-callout", first!);

  // The pause button is not decoration: asking for it by hand still works,
  // which is why it is not hidden under reduced motion.
  await page.locator('[data-mk-tour="play"]').click();
  await expect
    .poll(async () => callout.getAttribute("data-mk-callout"), { timeout: 15000 })
    .not.toBe(first);
});

test("the tour leaves the tree pane alone", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "tree", exact: true }).click();
  await page.waitForTimeout(6500);
  await expect(page.getByRole("button", { name: "tree", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#compare pre")).toContainText("└── Tags");
});

test("the arrows step through the features, and wrap", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);

  const callout = page.locator("[data-mk-callout]");
  const first = await callout.getAttribute("data-mk-callout");

  await page.locator('[data-mk-cycle="next"]').click();
  await expect(callout).not.toHaveAttribute("data-mk-callout", first!);

  await page.locator('[data-mk-cycle="prev"]').click();
  await expect(callout).toHaveAttribute("data-mk-callout", first!);

  // Backwards past the first feature wraps to the last one in the catalogue.
  await page.locator('[data-mk-cycle="prev"]').click();
  await expect(callout).toHaveAttribute("data-mk-callout", "tags");
});

test("the Crown Shyness dial re-flows the demo canvas", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  // Park first: that waits for hydration, so the chip click below cannot land
  // on a button whose handlers are not attached yet.
  await parkTheTour(page);
  await page.locator('[data-mk-chip="organize"]').click();

  // A control in a proof has to actually do something: the dial is the app's
  // own Slider, and moving it re-lays out the cards behind it. The last card
  // sits below every gap the dial opens, so it must move down.
  const card = page.locator('[data-mk-node="tags"]');
  const before = await card.boundingBox();
  expect(before).not.toBeNull();

  const thumb = page.locator("[data-mk-shyness] [role='slider']");
  await thumb.focus();
  await thumb.press("End");

  await expect(page.locator("[data-mk-shyness-readout]")).toHaveText("3.0×");
  await expect.poll(async () => (await card.boundingBox())!.y).toBeGreaterThan(before!.y);
  // The re-flow slides the rail under the parked pointer, and the browser fires
  // a hover for it. The card stays on Organize rather than following whatever
  // happens to land beneath the pointer.
  await expect(page.locator("[data-mk-callout]")).toHaveAttribute(
    "data-mk-callout",
    "organize",
  );
});

test("gated features are badged, not sold", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);

  // Tags are Pro (MIN_TIER.tags). The badge explains the gate; there is no
  // purchase path to offer while billing is off, so the inspector does not
  // link out at all - it used to offer a "Try it" that only read the docs.
  await page.locator('[data-mk-chip="tags"]').click();
  await expect(page.getByTitle("Needs a signed-in Pro account")).toBeVisible();
  await expect(page.locator('[data-mk-callout="tags"] a')).toHaveCount(0);
});

test("a chip drives the callout the same way a card does", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);
  await page.locator('[data-mk-chip="organize"]').click();
  await expect(page.locator('[data-mk-callout="organize"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "One key re-flows the tree" }),
  ).toBeVisible();
});

test("the themes proof links to the gallery's themes tab, and the tab is in the URL", async ({
  page,
}) => {
  // The one proof that leaves the page: a theme can only be tried where an
  // Apply button restyles a whole document, which is the gallery.
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);
  await page.locator('[data-mk-chip="themes"]').click();
  await expect(page.locator('[data-mk-callout="themes"]')).toBeVisible();

  const link = page.getByRole("link", {
    name: "Open the community theme gallery and try a theme on this page",
  });
  await expect(link).toHaveAttribute("href", "/gallery?tab=themes");
  await link.click();

  // Landed on the themes tab, not the graphs default.
  await page.waitForURL("**/gallery?tab=themes");
  await expect(page.getByRole("button", { name: "Themes" })).toBeVisible();
  await expect(page.getByLabel("Search themes or authors")).toBeVisible();

  // The tab is part of the URL in both directions: toggling rewrites it, so
  // the current view is always a shareable link.
  await page.getByRole("button", { name: "Graphs" }).click();
  await expect(page).toHaveURL(/\/gallery$/);
  await page.getByRole("button", { name: "Themes" }).click();
  await expect(page).toHaveURL(/tab=themes/);
  await expect(page.getByLabel("Search themes or authors")).toBeVisible();
});

test("privacy and open source sections are on the page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your data stays yours" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the Privacy Policy" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Open source" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View on GitHub" })).toBeVisible();
  // "Launch the app" appears in the hero, the navbar, the footer and here.
  await expect(page.getByRole("link", { name: "Launch the app" }).last()).toBeVisible();

  // The privacy section is a split (T-155) with a bento right column (T-156):
  // heading + intro + action left; on the right one hero claim with a
  // schematic, three mono stat badges, then the compact claim rows. Pin the
  // hierarchy - the hero claim reads larger than a compact row - and the
  // badges, rather than the old centred rhythm.
  const privacy = page.getByRole("heading", { name: "Your data stays yours" });
  const claim = page.getByRole("listitem").filter({ hasText: "No selling your data" });
  const claimBox = await claim.boundingBox();
  expect(claimBox).not.toBeNull();
  expect((await privacy.boundingBox())!.x).toBeLessThan(claimBox!.x);
  // Every claim shares one left edge: one column, not a wrapping grid.
  const boxes = await page.getByRole("listitem").evaluateAll((els) =>
    els
      .filter((el) => el.closest("section")?.querySelector("h2")?.textContent === "Your data stays yours")
      .map((el) => (el as HTMLElement).getBoundingClientRect().x),
  );
  expect(new Set(boxes).size).toBe(1);
  // The hero claim outranks the compact rows in type size.
  const hero = page.locator("[data-mk-privacy-hero] span");
  const heroSize = await hero.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const rowSize = await claim.locator("span").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(heroSize).toBeGreaterThan(rowSize);
  // The short version: three mono stat badges.
  await expect(page.locator("[data-mk-privacy-stat]")).toHaveCount(3);
  await expect(page.getByText("AGPLv3", { exact: true })).toBeVisible();

  // Reveal hides content until it is scrolled into view. Being in the DOM is
  // not the same as being readable, so this visits every revealed block - the
  // way a reader gets to them - and then waits for all of them to have
  // actually revealed themselves.
  const reveals = page.locator("[data-reveal]");
  for (let i = 0; i < (await reveals.count()); i += 1) {
    await reveals.nth(i).scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-reveal]")].every(
      (el) => el.getAttribute("data-reveal") === "1",
    ),
  );
});

test("/welcome redirects to the canonical home instead of duplicating it", async ({ page }) => {
  const response = await page.goto("/welcome");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { name: /interactive graph/i })).toBeVisible();
});
