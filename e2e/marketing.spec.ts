import { test, expect } from "@playwright/test";

/**
 * Marketing home page guards (T-149, T-150): the page makes claims about the
 * product, and those claims drift the way the changelog does — the format
 * count, the vocabulary, and the one canonical URL all silently went stale
 * before. Cheap assertions, one page load each.
 */

test("the home page states the current product", async ({ page }) => {
  await page.goto("/");

  // 8 export formats since the .fwr document shipped (T-145).
  await expect(page.getByText("Export in 8 formats")).toBeVisible();
  await expect(page.getByText("Export in 7 formats")).toHaveCount(0);

  // Headline free feature, in the first story slot.
  await expect(page.getByRole("heading", { name: "Canvas groups" })).toBeVisible();

  // App-wide vocabulary: cards, not nodes (T-136-era copy change).
  await expect(page.getByText("search across every card")).toBeVisible();
  await expect(page.getByText(/every node/)).toHaveCount(0);

  // Only GitHub URLs are actually recognised — the copy must not promise Git.
  await expect(page.getByText("a GitHub repo")).toBeVisible();

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
});

test("the home page sits on the canvas dot grid", async ({ page }) => {
  await page.goto("/");

  // Same gap/size as the app canvas, and inert: it is a backdrop, not UI.
  await expect(page.locator(".mk-dotgrid")).toBeVisible();
  await expect(page.locator(".mk-backdrop")).toHaveAttribute("aria-hidden", "true");
});

test("the tree vs graph comparison switches views", async ({ page }) => {
  await page.goto("/");

  // Exactly one copy of the sample graph on the page: the hero no longer
  // renders a second instance beside this one.
  await expect(
    page.locator('[role="region"][aria-label="Sample project graph"]'),
  ).toHaveCount(1);

  // Both panes stay mounted and stacked in one grid cell, so the container
  // height never jumps; the toggle only moves opacity.
  const treePane = page.locator("#compare pre");
  await page.getByRole("button", { name: "tree", exact: true }).click();
  await expect(treePane).toHaveCSS("opacity", "1");
  await expect(treePane).toContainText("└── package.json");

  await page.getByRole("button", { name: "fewer", exact: true }).click();
  await expect(page.locator("#compare [data-mk-node]").first()).toBeVisible();
});

test("/welcome redirects to the canonical home instead of duplicating it", async ({ page }) => {
  const response = await page.goto("/welcome");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { name: /interactive graph/i })).toBeVisible();
});
