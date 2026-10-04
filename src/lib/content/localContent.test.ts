// T-092: offline content source for the desktop static export.
import { describe, expect, test } from "bun:test";
import { parseContentFile } from "./localContent";

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
