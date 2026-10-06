// T-092: offline content source for the desktop static export.
import { describe, expect, test, afterEach } from "bun:test";
import {
  parseContentFile,
  listLocalContent,
  getLocalContent,
  isDesktopExport,
  neutralizeDeadShellLinks,
} from "./localContent";

describe("parseContentFile", () => {
  const DOC = `---
title: Keyboard Shortcuts
description: Complete reference.
---

Body line one.

## Section
- item
`;

  test("extracts front matter fields and body", () => {
    const c = parseContentFile(DOC, "shortcuts");
    expect(c.slug).toBe("shortcuts");
    expect(c.title).toBe("Keyboard Shortcuts");
    expect(c.description).toBe("Complete reference.");
    expect(c.content.startsWith("Body line one.")).toBe(true);
    expect(c.content).not.toContain("title:");
  });

  test("keeps later fences inside the body (no truncation)", () => {
    const withRule = `---\ntitle: T\n---\nintro\n\n---\n\nafter the rule\n`;
    const c = parseContentFile(withRule, "t");
    expect(c.content).toContain("after the rule");
  });

  test("missing front matter falls back to the whole text", () => {
    const c = parseContentFile("just text", "x");
    expect(c.title).toBe("");
    expect(c.content).toBe("just text");
  });

  test("blog fields (date/author/tags) come through", () => {
    const POST = `---\ntitle: P\ndate: 2026-10-01\nauthor: Ada\ntags: release, notes\n---\nbody\n`;
    const c = parseContentFile(POST, "p");
    expect(c.date).toBe("2026-10-01");
    expect(c.author).toBe("Ada");
    expect(c.tags).toBe("release, notes");
  });
});

describe("shell export filtering (T-104)", () => {
  const orig = process.env.DESKTOP_EXPORT;
  afterEach(() => {
    if (orig === undefined) delete process.env.DESKTOP_EXPORT;
    else process.env.DESKTOP_EXPORT = orig;
  });

  test("export mode: web-only docs hidden, app-only page in, blogs gone", async () => {
    process.env.DESKTOP_EXPORT = "1";
    expect(isDesktopExport()).toBe(true);
    const docs = (await listLocalContent("docs")).map((d) => d.slug);
    expect(docs).toContain("getting-started");
    expect(docs).toContain("desktop"); // app-only ships in the shell
    expect(docs).not.toContain("cloud"); // web-only hidden
    expect(docs).not.toContain("plans");
    expect(docs).not.toContain("privacy");
    expect(await listLocalContent("blog")).toEqual([]); // blogs are web-only
  });

  test("web mode: app-only docs hidden, web docs kept", async () => {
    delete process.env.DESKTOP_EXPORT;
    expect(isDesktopExport()).toBe(false);
    const docs = (await listLocalContent("docs")).map((d) => d.slug);
    expect(docs).not.toContain("desktop");
    expect(docs).toContain("cloud");
    expect(docs).toContain("getting-started");
  });

  test("shell:off/on blocks render per mode and markers never leak", async () => {
    process.env.DESKTOP_EXPORT = "1";
    const shell = (await getLocalContent("docs", "getting-started"))!;
    expect(shell.content).not.toContain("Sign In (Optional)");
    expect(shell.content).not.toContain("/docs/sharing");
    expect(shell.content).toContain("In the Desktop App");
    expect(shell.content).not.toContain("<!-- shell:");

    delete process.env.DESKTOP_EXPORT;
    const web = (await getLocalContent("docs", "getting-started"))!;
    expect(web.content).toContain("Sign In (Optional)");
    expect(web.content).toContain("/docs/sharing");
    expect(web.content).not.toContain("In the Desktop App");
    expect(web.content).not.toContain("<!-- shell:");
  });

  test("settings.md drops the Accounts/Sign-in section in the shell only", async () => {
    process.env.DESKTOP_EXPORT = "1";
    const shell = (await getLocalContent("docs", "settings"))!;
    expect(shell.content).not.toContain("### Sign in");
    expect(shell.content).not.toContain("/docs/accounts");
    expect(shell.content).toContain("## Notifications");

    delete process.env.DESKTOP_EXPORT;
    const web = (await getLocalContent("docs", "settings"))!;
    expect(web.content).toContain("### Sign in");
  });

  test("neutralizeDeadShellLinks: dead targets degrade to text, live ones stay", () => {
    const md = [
      "see [Accounts](/docs/accounts) and [Sharing](/docs/sharing)",
      "[Graph Features](/docs/graph-features) [Shortcuts](/docs/shortcuts#ctrl-a)",
      "[Index](/docs) [Blog](/blog) [Privacy](/privacy) [external](https://example.com)",
    ].join("\n");
    const out = neutralizeDeadShellLinks(md);
    expect(out).toContain("see Accounts and Sharing");
    expect(out).toContain("[Graph Features](/docs/graph-features)");
    expect(out).toContain("[Shortcuts](/docs/shortcuts#ctrl-a)");
    expect(out).toContain("[Index](/docs)");
    expect(out).toContain("Blog Privacy [external](https://example.com)");
    expect(out).not.toContain("/docs/accounts");
    expect(out).not.toContain("](/blog");
  });
});
