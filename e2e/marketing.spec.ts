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

  // 8 export formats since the .fwr document shipped (T-145). Chips and pins
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

  // Exactly one copy of the sample graph on the page.
  await expect(
    page.locator('[role="region"][aria-label="Sample project graph"]'),
  ).toHaveCount(1);

  // Both panes stay mounted and stacked in one grid cell, so the container
  // height never jumps; the toggle only moves opacity. The hidden pane is
  // `invisible`, so it cannot be tabbed into.
  const treePane = page.locator("#compare pre");
  await page.getByRole("button", { name: "tree", exact: true }).click();
  await expect(treePane).toHaveCSS("opacity", "1");
  await expect(treePane).toContainText("└── package.json");

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
  // Same column: the caption and the tree text share a left edge.
  expect(Math.abs(preBox!.x - captionBox!.x)).toBeLessThan(4);
  // And that column is inside the page container, not at the viewport edge.
  expect(preBox!.x).toBeGreaterThan(16);
});

test("a card reveals its feature, and only the active card is marked", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);

  // One marker on the canvas, never a dozen: the feature the callout is
  // telling, worn by the card it is anchored to.
  const tag = page.locator("[data-mk-tag]");
  await expect(tag).toHaveCount(1);

  // Hovering a card shows that feature in the callout, and the tag goes with it.
  await page.locator('[data-mk-node="types"]').hover();
  await expect(page.locator('[data-mk-callout="tags"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Colour-code any card" }),
  ).toBeVisible();
  await expect(tag).toHaveCount(1);
  await expect(tag).toHaveAttribute("data-mk-tag", "tags");
  await expect(page.locator('[data-mk-node="types"] [data-mk-tag="tags"]')).toHaveCount(1);
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
  // The canvas points at the same feature the whole time: one tag, on that card.
  await expect(page.locator("[data-mk-tag]")).toHaveCount(1);
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
  await expect(page.locator("#compare pre")).toContainText("└── package.json");
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
  // own Slider, and moving it re-lays out the cards behind it.
  const card = page.locator('[data-mk-node="pkg"]');
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

test("a chip drives the callout the same way a pin does", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);
  await page.locator('[data-mk-chip="organize"]').click();
  await expect(page.locator('[data-mk-callout="organize"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "One key re-flows the tree" }),
  ).toBeVisible();
});

test("privacy and open source sections are on the page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Your data stays yours" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the Privacy Policy" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Open source" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View on GitHub" })).toBeVisible();
  // "Launch the app" appears in the hero, the navbar, the footer and here.
  await expect(page.getByRole("link", { name: "Launch the app" }).last()).toBeVisible();

  // The two closing sections share one rhythm now: same container, same
  // heading scale, both centred on the same dot grid (no tinted band behind
  // only one of them).
  const privacy = page.getByRole("heading", { name: "Your data stays yours" });
  const openSource = page.getByRole("heading", { name: "Open source" });
  expect((await privacy.boundingBox())!.x).toBe((await openSource.boundingBox())!.x);
  expect((await privacy.boundingBox())!.height).toBe((await openSource.boundingBox())!.height);

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
