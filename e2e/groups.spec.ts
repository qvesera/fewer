import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
async function createGroupFromCards(page: Page, a: ReturnType<typeof page.locator>, b: ReturnType<typeof page.locator>) {
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

/** Select two cards and create a group from the multi-selection menu. */
async function createGroup(page: Page) {
  const [a, b] = await standaloneCards(page);
  return createGroupFromCards(page, a, b);
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
  // Selection rings the MEMBER cards directly (T-141) — the box says which
  // cards belong to it without needing to enclose them.
  await expect(page.locator("[data-group-member-ring]")).toHaveCount(2);

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

test("Organize no longer re-flows cards onto a collapsed group's pill (T-140)", async ({ page }) => {
  await openCanvas(page);
  const { frame } = await createGroup(page);
  await expect(frame).toBeVisible();

  // Collapse the group: its members join hiddenIds, and relayout used to
  // exclude every hidden node — the members froze at stale coords while cards
  // re-flowed INTO that space, so the pill drew over them (T-140).
  await page.getByRole("button", { name: "Collapse group" }).click();
  const pill = page.locator("[data-pill-shell]");
  await expect(pill).toBeVisible();

  await page.keyboard.press("Alt+r");
  await page.waitForTimeout(700);

  const pb = (await pill.boundingBox())!;
  const rects = await page.locator(".react-flow__node").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { l: r.x, t: r.y, r: r.x + r.width, b: r.y + r.height };
    }),
  );
  expect(rects.length).toBeGreaterThan(0);
  for (const c of rects) {
    const intersects = !(c.r <= pb.x || c.l >= pb.x + pb.width || c.b <= pb.y || c.t >= pb.y + pb.height);
    expect(intersects, `card at (${c.l},${c.t}) overlaps the pill`).toBe(false);
  }
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

  // The collapsed pill is a card-sized shell in the folder-pill design
  // language — never the old near-black toolbar strip reading "0 of 2 members"
  // (T-139).
  const pill = page.locator("[data-pill-shell]");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveClass(/rounded-xl/);
  await expect(pill).toHaveClass(/bg-fewer-group-bg/);
  await expect(pill).toContainText("2 members");
  await expect(pill).not.toContainText("0 of");

  await page.getByRole("button", { name: "Expand group" }).click();
  await expect(cards[0]).toBeVisible();

  await page.getByRole("button", { name: "Ungroup" }).click();
  await expect(page.locator("[data-group-id]")).toHaveCount(0);
  await expect(cards[0]).toBeVisible();
});

test("Reveal All (⇧H) expands a collapsed group — no pill over live cards (T-167)", async ({ page }) => {
  await openCanvas(page);
  const { cards } = await createGroup(page);
  await page.getByRole("button", { name: "Collapse group" }).click();
  await expect(cards[0]).toBeHidden();
  const pill = page.locator("[data-pill-shell]");
  await expect(pill).toBeVisible();

  // Since T-164 the COLLAPSE is what hides the cards (per-view state, not a
  // hiddenIds write), so the reveal has to OPEN the group: the pill becomes the
  // frame again and the cards come back — never a pill over live cards, and
  // never a silent no-op.
  await page.keyboard.press("Shift+H");
  await expect(cards[0]).toBeVisible();
  await expect(cards[1]).toBeVisible();
  await expect(pill).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collapse group" })).toBeVisible();
});

test("revealing ONE card of a collapsed group opens the frame but keeps the siblings hidden (T-169)", async ({ page }) => {
  await openCanvas(page);
  // The reload cache is written debounced after Load Sample — wait for it so
  // the peer pair can be computed from the real edges.
  await page.waitForFunction(() => sessionStorage.getItem("fewer-graph") !== null);
  // Two folders that are NEITHER ancestor nor descendant of each other — an
  // ancestor pair would make a subtree reveal legitimately un-hide both (its
  // targets include the whole subtree), which is not what this test is about.
  const peers = await page.evaluate(() => {
    const raw = sessionStorage.getItem("fewer-graph");
    if (!raw) return null;
    // Only rendered CARDS are groupable (child rows are 13px and not all cache
    // folders paint as cards at this depth).
    const rendered = new Set(
      Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"))
        .filter((e) => e.getBoundingClientRect().height > 40)
        .map((e) => e.dataset.id)
        .filter((id): id is string => Boolean(id)),
    );
    const g = JSON.parse(raw);
    const edges: { source: string; target: string }[] = g.edges ?? [];
    const children = new Map<string, string[]>();
    for (const e of edges) children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
    const descendants = (id: string) => {
      const out = new Set<string>();
      const q = [...(children.get(id) ?? [])];
      while (q.length) {
        const x = q.pop()!;
        if (out.has(x)) continue;
        out.add(x);
        q.push(...(children.get(x) ?? []));
      }
      return out;
    };
    const folders = (g.nodes as { id: string; data: { type: string } }[]).filter(
      (n) => n.data?.type === "folder" && rendered.has(n.id),
    );
    for (const a of folders) {
      for (const b of folders) {
        if (a.id === b.id) continue;
        if (descendants(a.id).has(b.id) || descendants(b.id).has(a.id)) continue;
        return { a: a.id, b: b.id };
      }
    }
    return null;
  });
  expect(peers).not.toBeNull();
  const a = page.locator(`[data-id="${peers!.a}"]`);
  const b = page.locator(`[data-id="${peers!.b}"]`);
  const { cards } = await createGroupFromCards(page, a, b);
  await page.getByRole("button", { name: "Collapse group" }).click();
  await expect(cards[0]).toBeHidden();
  await expect(cards[1]).toBeHidden();

  // The Hidden Cards panel (open by default) lists both members — as folder
  // rows, so the eye reads "Show subtree". Reveal ONE: the frame must come
  // back, but only the asked-for card — the sibling stays in the panel.
  await page.getByRole("button", { name: "Show subtree" }).first().click();
  // The parked sibling keeps the panel's badge at 1 — the reveal is scoped.
  await expect(page.getByRole("button", { name: /Hidden Cards/ })).toContainText("1");
  // Poll, don't sample: the reveal is a store write + canvas re-render.
  await expect
    .poll(async () => Number(await cards[0].isVisible()) + Number(await cards[1].isVisible()))
    .toBe(1); // exactly one came back
  await expect(page.locator("[data-pill-shell]")).toHaveCount(0); // a frame, not a pill
  await expect(page.getByRole("button", { name: "Collapse group" })).toBeVisible();

  // The chevron is the one gesture that reveals the WHOLE cluster.
  await page.getByRole("button", { name: "Collapse group" }).click();
  await expect(cards[0]).toBeHidden();
  await expect(cards[1]).toBeHidden();
  await page.getByRole("button", { name: "Expand group" }).click();
  await expect(cards[0]).toBeVisible();
  await expect(cards[1]).toBeVisible();
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

test("renaming widens the pill to fit the name; no double ring while editing (T-142)", async ({ page }) => {
  await openCanvas(page);
  await createGroup(page);
  const pill = groupHeader(page);
  await pill.locator("button").first().click(); // collapse
  await expect(page.locator("[data-pill-shell]").first()).toBeVisible();

  // Layout width, not boundingBox: the pill lives under the canvas zoom
  // transform, so getBoundingClientRect shrinks with zoom (T-142).
  const layoutWidth = () => pill.evaluate((el) => parseFloat(getComputedStyle(el).width));
  const baseWidth = await layoutWidth();
  expect(baseWidth).toBeGreaterThanOrEqual(240); // the floor

  // Rename via double-click on the title (T-139) to something long.
  const longName = "A very long group name that must widen the pill beyond its floor";
  await pill.locator('span[role="button"]').first().dblclick();
  const input = page.locator('input[aria-label="Group title"]');
  await expect(input).toBeVisible();
  // The click that opened the editor also selects the frame, so the input must
  // not add a second ring on top of the selection outline (the reported bug).
  await expect(input).not.toHaveClass(/ring-1/);
  await input.fill(longName);
  await page.keyboard.press("Enter");

  // Content-driven: the pill grew past the floor and the name is fully visible.
  await expect(pill.getByText(longName)).toBeVisible();
  const widened = await layoutWidth();
  expect(widened).toBeGreaterThan(baseWidth);
  expect(widened).toBeGreaterThan(240);
});

test("zoom to selection centers a selected group — toolbar button and Alt+F (T-143)", async ({ page }) => {
  await openCanvas(page);
  const { frame } = await createGroup(page);
  await expect(frame).toBeVisible();
  const header = groupHeader(page);
  const canvas = () => page.locator(".react-flow").boundingBox();

  const expectCentered = async (target: ReturnType<typeof page.locator>) => {
    const pane = (await canvas())!;
    await expect
      .poll(async () => {
        const b = (await target.boundingBox())!;
        return Math.hypot(
          b.x + b.width / 2 - (pane.x + pane.width / 2),
          b.y + b.height / 2 - (pane.y + pane.height / 2),
        );
      })
      .toBeLessThan(24);
  };

  // Select the frame (clicking the header).
  const hb = (await header.boundingBox())!;
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await expect(frame).toHaveAttribute("data-selected", "true");

  // Pan away from the top-right corner of the pane — empty canvas there, so a
  // plain drag pans instead of moving a card — so centering is observable.
  const panAway = async () => {
    const pane = (await canvas())!;
    await page.mouse.move(pane.x + pane.width - 40, pane.y + 40);
    await page.mouse.down();
    await page.mouse.move(pane.x + pane.width - 340, pane.y + 300, { steps: 8 });
    await page.mouse.up();
  };
  await panAway();

  // Toolbar path: the crosshair button.
  await page.locator('button[title="Zoom to selection"]').click();
  await expectCentered(frame);

  // Keyboard path, on the collapsed pill (its box is the fit target, and its
  // members are hidden — invisible to React Flow's measured-node fitView).
  await header.locator("button").first().click(); // collapse
  await expect(page.locator("[data-pill-shell]").first()).toBeVisible();
  await panAway();
  await page.keyboard.press("Alt+F");
  await expectCentered(header);
});


/** Create a group from the cards at `indices` (among large standalone cards).
 *  Returns a stable locator keyed on the frame's group id. */
async function createGroupFrom(page: Page, indices: number[]) {
  const maxIdx = Math.max(...indices);
  const ids = await page.locator(".react-flow__node").evaluateAll(
    (els, count) =>
      els
        .filter((e) => (e as HTMLElement).getBoundingClientRect().height > 40)
        .slice(0, count)
        .map((e) => (e as HTMLElement).dataset.id),
    maxIdx + 1,
  );
  expect(ids.length).toBeGreaterThanOrEqual(maxIdx + 1);
  const chosen = indices.map((i) => page.locator(`[data-id="${ids[i]}"]`));
  await chosen[0].click();
  for (let k = 1; k < chosen.length; k++) {
    await chosen[k].click({ modifiers: ["Shift"] });
  }
  const box = (await chosen[0].boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 10, { button: "right" });
  await page.getByRole("menuitem", { name: "More Actions" }).hover();
  await page.getByRole("menuitem", { name: /^Group \d+ Items$/ }).click();
  const frames = page.locator("[data-group-id]");
  await expect(frames.first()).toBeVisible({ timeout: 10000 });
  const gid = await frames.last().getAttribute("data-group-id");
  return page.locator(`[data-group-id="${gid}"]`);
}

test("nesting: child frame sits inside the parent; collapsing the parent removes it", async ({ page }) => {
  await openCanvas(page);
  const parent = await createGroupFrom(page, [0, 1]);
  const parentGid = (await parent.getAttribute("data-group-id"))!;
  const child = await createGroupFrom(page, [2, 3]);
  const childGid = (await child.getAttribute("data-group-id"))!;
  expect(parentGid).not.toBe(childGid);
  await expect(page.locator("[data-group-id]")).toHaveCount(2);

  // Right-click the CHILD header → Move into group → the parent (the sole
  // target with only two groups, both defaulting to the title "Group").
  const childHeader = page.locator(`[data-group-header="${childGid}"]`);
  const hb = (await childHeader.boundingBox())!;
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2, { button: "right" });
  await page.getByRole("menuitem", { name: "Move into group" }).hover();
  await page.getByRole("menuitem", { name: "Group", exact: true }).click();

  // Nested: the parent frame must CONTAIN the child frame.
  await page.waitForTimeout(300);
  const pb = (await parent.boundingBox())!;
  const cb = (await child.boundingBox())!;
  expect(cb.x).toBeGreaterThanOrEqual(pb.x - 1);
  expect(cb.y).toBeGreaterThanOrEqual(pb.y - 1);
  expect(cb.x + cb.width).toBeLessThanOrEqual(pb.x + pb.width + 1);
  expect(cb.y + cb.height).toBeLessThanOrEqual(pb.y + pb.height + 1);

  // Collapse the parent → the child frame disappears (cascade, no orphan pill),
  // while the parent's own pill remains.
  await page
    .locator(`[data-group-id="${parentGid}"]`)
    .getByRole("button", { name: "Collapse group" })
    .click();
  await expect(page.locator(`[data-group-id="${childGid}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-group-id="${parentGid}"]`)).toBeVisible();
});

/**
 * T-145: the `.fwr` export is a graph DOCUMENT, so the group survives the
 * export → re-import round trip. The reimport runs on a canvas whose session
 * cache was cleared, so the only way the frame can come back is the file.
 */
test("export → re-import (.fwr) restores the group from the document (T-145)", async ({ page }) => {
  test.setTimeout(60_000); // export + download + reload + a 3-step import
  await openCanvas(page);
  await createGroup(page);

  // Export as FWR — an advanced format, but MIN_TIER is free (this context is
  // always signed out) so the tile is there.
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("button", { name: /FWR/ }).click();
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  const body = await readFile((await saved.path())!, "utf8");

  // The document itself carries the group — that is the whole point.
  const doc = JSON.parse(body) as { graph: { data: { groups: { title: string }[] } } };
  expect(doc.graph.data.groups).toHaveLength(1);

  // Fresh canvas: the reload cache is the other path that could restore the
  // group, and it must not be the one that does.
  await page.addInitScript(() => sessionStorage.removeItem("fewer-graph"));
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await expect(page.locator("[data-group-id]")).toHaveCount(0);

  // Import it through the File origin. The sidebar's Import button opens the
  // same 3-step dialog as Alt+I (the shortcut needs canvas focus after a
  // reload, the button never does).
  await page.getByRole("button", { name: "Import", exact: true }).first().click();
  // Scope to the import dialog by text that is present in EVERY step — the
  // step-1 radiogroup disappears from the a11y tree once we move on.
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "does not store or upload any data" });
  // The tile's accessible name carries the origin blurb, so match the prefix.
  await dialog.getByRole("radio", { name: /^File\b/ }).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "fewer-export.fwr",
    mimeType: "application/json",
    buffer: Buffer.from(body),
  });
  // A document lands whole, so step 3 reports what it restores instead of the
  // scan/filter summary the other payloads show. Two Continues: Origin → Options
  // → Import (step 2 replaces the filter panel with the document note).
  const next = dialog.getByRole("button", { name: "Continue" });
  await expect(next).toBeEnabled(); // the picked file has to finish reading first
  await next.click();
  await expect(dialog.getByText("nothing to configure here")).toBeVisible();
  await next.click();
  await expect(dialog.getByText("Cards, positions, tags, groups")).toBeVisible();
  // Step 3's action button is "Browse" for every origin (it runs the import).
  await dialog.getByRole("button", { name: "Browse" }).click();

  await expect(page.locator("[data-group-id]")).toHaveCount(1, { timeout: 15000 });
  // The frame is back over real cards, not an empty husk.
  await expect(page.locator(".react-flow__node")).not.toHaveCount(0);
});
