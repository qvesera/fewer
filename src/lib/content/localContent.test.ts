// T-092: offline content source for the desktop static export.
import { describe, expect, test, afterEach } from "bun:test";
import { parseContentFile, listLocalContent, isDesktopExport } from "./localContent";

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
});
