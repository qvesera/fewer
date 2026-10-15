import { test, expect } from "@playwright/test";
import { HERO_ROTATE_MS } from "../src/lib/fewer/marketingHero";

/**
 * Marketing home page guards (T-149, T-150, hotspot follow-ups, T-161): the
 * page makes claims about the product, and those claims drift the way the
 * changelog does - the format count, the vocabulary, and the one canonical URL
 * all silently went stale before. Cheap assertions, one page load each.
 *
 * The hero is its own screen now (T-161): four messages on a clock, one h1
 * exposed at a time, arrows and dots to drive it, and a timer bar inside the
 * active dot. Its guarantees (it starts without being asked, the arrows and
 * dots step and wrap, the pause parks it AND freezes that bar, reduced motion
 * parks it and turns Lenis off, the first scroll lands on the demo) have tests
 * of their own, and the ones that only ever read the hero run BEFORE anything
 * scrolls: scrolling changes what is in view, and Lenis eases every scroll
 * here.
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

  // The hero is the first screen and its h1 is the promise a newcomer reads,
  // so it is asserted BEFORE anything scrolls: a scroll arms the rotation
  // that moves the h1 to the next message 15s later. The /welcome redirect
  // test below asserts the same heading.
  await expect(
    page.getByRole("heading", { level: 1, name: "See everything in your folders at once" }),
  ).toBeVisible();

  // Exactly one heading is exposed at a time, however many messages are in
  // the HTML: the three that are off are aria-hidden.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  // The nav's Features link stays on the canonical page (it used to hop to
  // the duplicate at /welcome).
  await expect(page.getByRole("link", { name: "Features" })).toHaveAttribute(
    "href",
    "/#features",
  );

  // Waiting for the tour button is also waiting for hydration: the button is
  // server-rendered, but only the client decides whether it reads pause or
  // play, and a click that lands before that is a click into nothing.
  await parkTheTour(page);

  // The stale claim must stay gone: formats are counted in the README and the
  // metadata now, not on a rail with one screen of room.
  await expect(page.getByText("Export in 7 formats")).toHaveCount(0);

  // The search story, including the part a newcomer cannot do anywhere else:
  // finding a file that is still inside a zip.
  await page.locator('[data-mk-chip="search"]').click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Find any file by name" }),
  ).toBeVisible();

  // Headline free feature.
  await page.locator('[data-mk-chip="groups"]').click();
  await expect(page.getByRole("heading", { level: 2, name: "Box files into groups" })).toBeVisible();

  // App-wide vocabulary: cards, not nodes (T-136-era copy change).
  await page.locator('[data-mk-chip="keyboard"]').click();
  await expect(page.getByText("every action has a shortcut")).toBeVisible();
  await expect(page.getByText(/every node/)).toHaveCount(0);

  // Only GitHub URLs are actually recognised - the copy must not promise Git.
  await page.locator('[data-mk-chip="import"]').click();
  await expect(page.getByText("a GitHub repo")).toBeVisible();
});

test("the first screen is the hero, and the demo arrives on the scroll", async ({ page }) => {
  await page.goto("/");

  // The hero is a full viewport minus the sticky header, so nothing from the
  // demo is on the first screen. It is measured against the header's own
  // bottom edge rather than a hard number, so changing the header's padding
  // cannot pass this test by accident.
  const hero = page.locator("#hero");
  const headerBottom = await page
    .locator("header")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const heroBox = await hero.boundingBox();
  expect(heroBox!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 120);

  // The chassis is the demo, and it lives one screen down.
  const chassis = page.locator(".mk-chassis").first();
  expect((await chassis.boundingBox())!.y).toBeGreaterThan(page.viewportSize()!.height);

  // Scrolling back up re-centers the promise right under the header.
  await page.evaluate(() => window.scrollTo(0, 0));
  const heroTop = (await hero.boundingBox())!.y;
  expect(Math.abs(heroTop - headerBottom)).toBeLessThan(2);

  // And the demo section still names the thing the hero deliberately does
  // not: the phrase is on the page, just not in the reader's first read.
  await expect(page.getByRole("heading", { name: "Everything fewer does" })).toBeAttached();
});

test("the hero dots step by hand, and the current message is marked", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-mk-hero-slide="see"]')).toHaveAttribute("data-active", "1");

  const dot2 = page.getByRole("button", { name: "Message 2 of 4" });
  await dot2.click();
  await expect(dot2).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[data-mk-hero-slide="find"]')).toHaveAttribute("data-active", "1");
  await expect(page.locator('[data-mk-hero-slide="see"]')).toHaveAttribute("data-active", "0");
});

test("the hero starts on its own, and the page scrolls smoothly", async ({ page }) => {
  await page.goto("/");
  const state = page.locator("[data-mk-hero-state]");

  // No scroll and no click: the clock is already running, so a reader who
  // never touches anything still sees all four messages.
  await expect(state).toHaveAttribute("data-mk-hero-state", "running");

  // Lenis is installed on this page, so scrolling is eased rather than
  // jumped - it drives the real window scroll, not a wrapper div. Where the
  // first scroll goes is the next test: that gesture is the page's own.
  await expect(page.locator("html")).toHaveClass(/lenis/);
});

test("the first scroll takes the reader straight to the demo", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(40);

  await page.mouse.move(4, 4);
  await page.mouse.wheel(0, 120);

  // One gesture is the whole trip: the playground lands under the header, at
  // the same offset the nav's anchor jump uses.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const demo = document.getElementById("features");
          if (!demo) return 9999;
          const header = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue("--mk-header-h"),
          );
          return Math.abs(demo.getBoundingClientRect().top - header);
        }),
      { timeout: 5000 },
    )
    .toBeLessThan(6);

  // After that it is an ordinary page again: the second scroll just scrolls,
  // and the hero, now above the fold, parks its clock.
  await page.mouse.wheel(0, 4000);
  await expect(page.locator("[data-mk-hero-state]")).toHaveAttribute(
    "data-mk-hero-state",
    "idle",
  );
});

test("the arrows step through the messages and wrap", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-mk-hero-slide="see"]')).toHaveAttribute("data-active", "1");

  await page.locator('[data-mk-hero-step="next"]').click();
  await expect(page.locator('[data-mk-hero-slide="find"]')).toHaveAttribute("data-active", "1");

  await page.locator('[data-mk-hero-step="prev"]').click();
  await expect(page.locator('[data-mk-hero-slide="see"]')).toHaveAttribute("data-active", "1");

  // Backwards past the first message wraps to the last one, like the tour.
  await page.locator('[data-mk-hero-step="prev"]').click();
  await expect(page.locator('[data-mk-hero-slide="fix"]')).toHaveAttribute("data-active", "1");
});

test("the active dot's timer fills with the message, and pauses with it", async ({ page }) => {
  await page.goto("/");
  const bar = page.locator("[data-mk-hero-timer]");
  await expect(bar).toHaveCount(1);

  // It is a real animation, and its length is the same constant the JS clock
  // waits on - the CSS reads it from the markup, so the two cannot drift.
  const style = await bar.evaluate((el) => {
    const computed = getComputedStyle(el);
    return { name: computed.animationName, duration: computed.animationDuration };
  });
  expect(style.name).toContain("mk-hero-timer");
  expect(style.duration).toBe(`${HERO_ROTATE_MS / 1000}s`);

  // It travels towards the change (left to right): more of the dot is filled
  // a beat later than there was to begin with. The bar starts empty, so the
  // first box is legitimately zero pixels - wait for ink, then measure.
  const boxOf = async () => (await bar.boundingBox())?.width ?? 0;
  await expect.poll(boxOf).toBeGreaterThan(0);
  const firstWidth = await boxOf();
  await page.waitForTimeout(800);
  expect(await boxOf()).toBeGreaterThan(firstWidth);

  // Pausing freezes it exactly where it is: the bar is part of the clock, not
  // a decoration the button forgot about, and resuming picks up the remainder
  // instead of starting the message over.
  await page.locator('[data-mk-hero="pause"]').click();
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).animationPlayState)).toContain(
    "paused",
  );
  const frozenWidth = await boxOf();
  await page.waitForTimeout(1200);
  expect(Math.abs((await boxOf()) - frozenWidth)).toBeLessThan(1);
  await expect(bar).toHaveCount(1);
});

test("the hero advances on its own, and the pause stops it", async ({ page }) => {
  await page.goto("/");
  // On the clock from the moment the page is, and still in view: the hero is
  // a full screen, so nothing has to happen for it to run. Nothing else
  // gates it either - no hover, no focus, no scroll - which is the whole
  // point of having four messages: they are seen without being asked for.
  await expect(page.locator("[data-mk-hero-state]")).toHaveAttribute(
    "data-mk-hero-state",
    "running",
  );

  const second = page.locator('[data-mk-hero-slide="find"]');

  // It walks the messages without being asked ...
  await expect.poll(async () => second.getAttribute("data-active"), { timeout: 20000 }).toBe("1");

  // ... and stops for good the moment the reader parks it.
  await page.locator('[data-mk-hero="pause"]').click();
  await expect(page.locator('[data-mk-hero="play"]')).toBeVisible();
  await page.waitForTimeout(6500);
  await expect(second).toHaveAttribute("data-active", "1");
});

test("the hero never rotates under prefers-reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.mouse.move(4, 4);
  await page.waitForTimeout(6500);

  // The preference parks it rather than removing it: the dots are still a
  // real control, the way the feature tour's play button is. It also keeps
  // Lenis out - eased scrolling IS motion, so the page stays native.
  await expect(page.locator('[data-mk-hero-slide="see"]')).toHaveAttribute("data-active", "1");
  await expect(page.locator("html")).not.toHaveClass(/lenis/);
  await page.getByRole("button", { name: "Message 2 of 4" }).click();
  await expect(page.locator('[data-mk-hero-slide="find"]')).toHaveAttribute("data-active", "1");
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
  await expect(treePane).toContainText("└── Themes");

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
  // the ring follows - identity, not an anchor map. Themes is the last card in
  // the last group, so it is also the card the dial test below measures.
  await page.locator('[data-mk-node="themes"]').hover();
  await expect(page.locator('[data-mk-callout="themes"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Make it yours" })).toBeVisible();
  await expect(ring).toHaveCount(1);
  await expect(page.locator('[data-mk-node="themes"].mk-node-active')).toHaveCount(1);

  // Only the connections on the way to the ringed card stay lit once the
  // reader engages: the two edges of that card's own chain (root -> its group
  // -> it), not every edge its kept group folder happens to own (T-160).
  await expect(page.locator("path.mk-edge-flow:not(.mk-node-dim)")).toHaveCount(2);

  // Folder cards are structure: hovering one changes nothing. Approach it
  // from the root, the one path that cannot sweep a feature card on the way -
  // the folders sit in their own column, to the right of the root and left of
  // every card, and Playwright moves the mouse in steps a real pointer also
  // takes.
  await page.locator('[data-mk-node="root"]').hover();
  await page.locator('[data-mk-node="see"]').hover();
  await expect(page.locator('[data-mk-callout="themes"]')).toBeVisible();
  await expect(page.locator('[data-mk-node="themes"].mk-node-active')).toHaveCount(1);
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
  await expect(page.locator("#compare pre")).toContainText("└── Themes");
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
  await expect(callout).toHaveAttribute("data-mk-callout", "themes");
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
  const card = page.locator('[data-mk-node="themes"]');
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

test("no feature is badged or sold", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);

  // Nothing on the rail is gated today (T-161 cut tags, the one Pro feature),
  // so the inspector never wears the badge and never sells anything - it used
  // to offer a "Try it" that only read the docs. Every chip is clicked so the
  // assertions cannot rot when the catalogue moves.
  const chips = await page.locator("[data-mk-chip]").all();
  expect(chips.length).toBeGreaterThan(0);
  for (const chip of chips) {
    const id = await chip.getAttribute("data-mk-chip");
    await chip.click();
    await expect(page.locator(`[data-mk-callout="${id}"]`)).toBeVisible();
  }

  // The one link the inspector can render is the themes proof's trip to the
  // gallery - a destination that really exists and really applies a theme.
  await page.locator('[data-mk-chip="themes"]').click();
  const links = page.locator('[data-mk-callout="themes"] a');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute("href", "/gallery?tab=themes");

  await expect(page.getByTitle("Needs a signed-in Pro account")).toHaveCount(0);
});

test("a chip drives the callout the same way a card does", async ({ page }) => {
  await page.goto("/");
  await page.locator("#features").scrollIntoViewIfNeeded();
  await parkTheTour(page);
  await page.locator('[data-mk-chip="organize"]').click();
  await expect(page.locator('[data-mk-callout="organize"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "One click re-lays it out" }),
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
  // heading + intro + action left, centred against the bento; on the right a
  // two-column card grid - one hero claim, four claim cards, a full-width
  // footnote card, then three mono stat badges. Pin the split, the bento's
  // two edges (never a ragged one), the centring, and the type hierarchy.
  const privacy = page.getByRole("heading", { name: "Your data stays yours" });
  const claim = page.getByRole("listitem").filter({ hasText: "No selling your data" });
  const claimBox = await claim.boundingBox();
  expect(claimBox).not.toBeNull();
  expect((await privacy.boundingBox())!.x).toBeLessThan(claimBox!.x);
  // Every card lands on one of the bento's two column edges - six cards on a
  // two-edge grid, no lone column and no ragged right.
  const edges = await page.getByRole("listitem").evaluateAll((els) =>
    els
      .filter(
        (el) =>
          el.closest("section")?.querySelector("h2")?.textContent === "Your data stays yours",
      )
      .map((el) => {
        const r = el.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right)];
      }),
  );
  expect(edges.length).toBe(6);
  expect(edges.every(([left, right]) => right > left)).toBe(true);
  expect(new Set(edges.map(([left]) => left)).size).toBeLessThanOrEqual(2);
  expect(new Set(edges.map(([, right]) => right)).size).toBeLessThanOrEqual(2);
  // The hero spans both columns; a claim card sits on one.
  const heroBox = await page.locator("[data-mk-privacy-hero]").boundingBox();
  expect(heroBox!.width).toBeGreaterThan(claimBox!.width);
  // On a split viewport the heading block is centred against the bento;
  // stacked, it sits above - so only the split shape gets the centring pin.
  const centreDelta = await page.evaluate(() => {
    const h2 = [...document.querySelectorAll("h2")].find(
      (el) => el.textContent === "Your data stays yours",
    );
    if (!h2) return null;
    const left = (h2.parentElement as HTMLElement).getBoundingClientRect();
    const grid = h2.parentElement!.parentElement as HTMLElement;
    if (getComputedStyle(grid).gridTemplateColumns.split(" ").length < 2) return "stacked";
    const right = (grid.querySelector("ul")!.parentElement as HTMLElement).getBoundingClientRect();
    return Math.abs(left.top + left.height / 2 - (right.top + right.height / 2));
  });
  expect(
    centreDelta === "stacked" || (typeof centreDelta === "number" && centreDelta < 24),
  ).toBe(true);
  // The hero claim outranks a claim card in type size.
  const heroSize = await page
    .locator("[data-mk-privacy-headline]")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cardSize = await claim
    .locator("p")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(heroSize).toBeGreaterThan(cardSize);
  // The statements are trust copy: present word for word, never paraphrased.
  for (const statement of [
    "Runs locally in your browser, so your directory contents stay on your device by default.",
    "No account required. Sign in is optional, and only used for saved graphs and sharing across devices.",
    "Optional cloud connections are scoped: we fetch only the trees you ask for, and never store your connected account's contents.",
    "No selling your data, no advertising trackers, no hidden telemetry.",
    "Watch digests are opt-in; we only store the public URLs you add and email changes you requested.",
    "Hosting operates on standard server logs only.",
  ]) {
    await expect(page.getByText(statement, { exact: true })).toBeVisible();
  }
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
  await expect(
    page.getByRole("heading", { name: "See everything in your folders at once" }),
  ).toBeVisible();
});
