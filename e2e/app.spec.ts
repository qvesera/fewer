import { test, expect, type Page } from "@playwright/test";

/**
 * E2E smoke flows. Kept lean on purpose — E2E is the slowest CI job, so this
 * covers the flows unit tests can't: real canvas render, node selection, and
 * store transactions (add/delete/copy/undo/redo). Auth-gated features are
 * intentionally excluded (Add Child Node, Share, advanced menu items).
 */

// The sample-load button exists twice (top toolbar + React Flow's empty-canvas
// placeholder). The toolbar one renders first in DOM order, so take .first().
async function loadSample(page: Page) {
  await page.getByRole("button", { name: "Load Sample" }).first().click();
}

// Wait for the default sample graph to be on the canvas.
async function openCanvas(page: Page) {
  await page.goto("/app");
  await loadSample(page);
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15000 });
}

const nodeByName = (page: Page, name: string) =>
  page.locator(".react-flow__node").filter({ hasText: name });

// React Flow marks a selected node with a bare `selected` class token.
const selected = () => /(^|\s)selected(\s|$)/;

// The tutorial auto-opens on first visit and its overlay blocks clicks. Suppress
// it deterministically by pre-seeding the same localStorage keys the store reads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fewer-tutorial-dismissed", "true");
    localStorage.setItem("fewer-tutorial-beginner-done", JSON.stringify([]));
  });
});

test("loads the sample project and renders nodes", async ({ page }) => {
  await page.goto("/app");
  await loadSample(page);

  const nodes = page.locator(".react-flow__node");
  await expect(nodes.first()).toBeVisible({ timeout: 15000 });

  // A known deep file from SAMPLE_TREE reaches the canvas.
  await expect(nodeByName(page, "App.tsx").first()).toBeVisible({ timeout: 10000 });
});

test("adds a node, then undoes and redoes", async ({ page }) => {
  await openCanvas(page);

  // Alt+N opens the Add Node dialog (standalone, nothing selected).
  await page.keyboard.press("Alt+n");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });

  await page.locator("#node-name").fill("notes.md");
  await dialog.getByRole("button", { name: /Create (folder|file)/ }).click();

  const newNode = nodeByName(page, "notes.md");
  await expect(newNode).toHaveCount(1, { timeout: 10000 });

  // Undo removes it.
  await page.keyboard.press("Control+z");
  await expect(newNode).toHaveCount(0, { timeout: 10000 });

  // Redo restores it.
  await page.keyboard.press("Control+Shift+z");
  await expect(newNode).toHaveCount(1, { timeout: 10000 });
});

test("deletes a node from the context menu, then undoes", async ({ page }) => {
  await openCanvas(page);

  const node = nodeByName(page, "src").first();
  await node.click({ button: "right" });

  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(node).toHaveCount(0);

  // Undo brings the node (and its whole deleted subtree) back.
  await page.keyboard.press("Control+z");
  await expect(node).toHaveCount(1);
});

test("node context menu offers cut, duplicate, and delete", async ({ page }) => {
  await openCanvas(page);

  await nodeByName(page, "src").first().click({ button: "right" });

  await expect(page.getByText("Duplicate", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Delete", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Cut", { exact: true }).first()).toBeVisible();
});

test("search finds nodes from the global search bar", async ({ page }) => {
  await openCanvas(page);

  const search = page.getByPlaceholder("Search directory nodes...");
  await search.click();
  await search.fill("CustomNode");

  const results = page.getByRole("option");
  await expect(results.first()).toBeVisible({ timeout: 10000 });
  await expect(results.filter({ hasText: "CustomNode.tsx" }).first()).toBeVisible();
});

test("opens the export panel", async ({ page }) => {
  await openCanvas(page);

  await page.getByRole("button", { name: "Export" }).click();

  // Unique to the export sheet.
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Generate Share Link")).toBeVisible();
});

test("copy and paste duplicates a selected node", async ({ page }) => {
  await openCanvas(page);

  const node = nodeByName(page, "App.tsx").first();
  await node.click();
  await expect(node).toHaveClass(selected());

  const before = await page.locator(".react-flow__node").count();

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");

  await expect(page.locator(".react-flow__node")).toHaveCount(before + 1);
});

// Regression: a post-mount layout-direction change (responsive default on
// screens <2560×1440, or cloud/local settings sync) used to remount the whole
// ReactFlow tree via `key={direction}`, after which dragging the minimap no
// longer panned the canvas (@xyflow/react 12.11.2 fails to re-bind the minimap
// zoom listeners when its panZoom instance is replaced). Seed a saved "LR"
// direction so settings sync flips TB→LR after mount, then drag the minimap.
test("minimap drag pans the canvas after a post-mount direction change", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "fewer-user-settings",
      JSON.stringify({ version: 1, direction: "LR" }),
    );
  });

  await page.goto("/app");
  await loadSample(page);
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 15000 });

  const minimap = page.locator(".react-flow__minimap");
  await expect(minimap).toBeVisible({ timeout: 10000 });

  const viewport = page.locator(".react-flow__viewport");
  await viewport.waitFor({ state: "attached" });
  const before = await viewport.getAttribute("style");

  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 5 });
  await page.waitForTimeout(150);
  const after = await viewport.getAttribute("style");
  await page.mouse.up();

  expect(after).not.toBe(before);
});
