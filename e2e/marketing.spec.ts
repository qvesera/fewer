import { test, expect } from "@playwright/test";

/**
 * Marketing home page guards (T-149, T-150, hotspot follow-up): the page makes
 * claims about the product, and those claims drift the way the changelog does -
 * the format count, the vocabulary, and the one canonical URL all silently went
 * stale before. Cheap assertions, one page load each.
 *
 * The feature copy moved out of the capability cards and into the playground's
 * callouts, which show one feature at a time. So the copy guards below click
 * the chip that shows a feature first: the guarantee is the same ("the page
 * says 8, says cards, says GitHub"), only the route to it changed.
 */

test("the home page states the current product", async ({ page }) => {
  await page.goto("/");

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

test("hovering a pin reveals its feature", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();

  // Hovering a pin on the graph shows that feature in the callout.
  await page.locator('[data-mk-pin="tags"]').hover();
  await expect(page.locator('[data-mk-callout="tags"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Colour-code any card" }),
  ).toBeVisible();
});

test("nothing on the page advances without the reader", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();

  // A tour that rewrote the callout on idle is what forced a pause control
  // onto the page. The callout must stay put for longer than any old tour
  // interval while nobody touches it.
  const callout = page.locator("[data-mk-callout]");
  const first = await callout.getAttribute("data-mk-callout");
  await page.waitForTimeout(4500);
  await expect(callout).toHaveAttribute("data-mk-callout", first!);
});

test("gated features are badged, not sold", async ({ page }) => {
  await page.goto("/");

  // Tags are Pro (MIN_TIER.tags). The badge explains the gate; there is no
  // purchase path to offer while billing is off.
  await page.locator('[data-mk-chip="tags"]').click();
  await expect(page.getByTitle("Needs a signed-in Pro account")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try it" })).toHaveAttribute(
    "href",
    "/docs/graph-features#tags-pro",
  );
});

test("a chip drives the callout the same way a pin does", async ({ page }) => {
  await page.goto("/");
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

  // Reveal hides content until it is scrolled into view. Being in the DOM is
  // not the same as being readable, so this waits for every section to have
  // actually revealed itself after a scroll.
  await page.getByRole("heading", { name: "Open source" }).scrollIntoViewIfNeeded();
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
