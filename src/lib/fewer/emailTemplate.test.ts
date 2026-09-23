import { describe, expect, test } from "bun:test";
import { emailShell, escapeHtml } from "./emailTemplate";

describe("escapeHtml", () => {
  test("escapes &, <, >, double and single quotes", () => {
    expect(escapeHtml(`a&b <c> "d" 'e'`)).toBe("a&amp;b &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  });

  test("returns unchanged when no special chars", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});

describe("emailShell", () => {
  const render = (overrides?: Record<string, unknown>) =>
    emailShell({
      preheader: "Test preheader",
      heading: "Hello",
      intro: "Welcome",
      body: "<p>Body content</p>",
      ...overrides,
    });

  test("contains the wordmark", () => {
    expect(render()).toContain("fewer");
    expect(render()).toContain(".directory");
  });

  test("contains the footer text", () => {
    expect(render()).toContain("Interactive File &amp; System Graph Visualizer");
  });

  test("includes the preheader span", () => {
    expect(render()).toContain("Test preheader");
  });

  test("renders CTA when provided", () => {
    const html = render({ cta: { text: "Click me", href: "https://example.com" } });
    expect(html).toContain("Click me");
    expect(html).toContain("https://example.com");
  });

  test("no CTA renders no button", () => {
    expect(render()).not.toContain("Click me");
  });

  test("renders footnote when provided", () => {
    const html = render({ footnote: "Footnote text" });
    expect(html).toContain("Footnote text");
  });

  test("escapes user-supplied heading", () => {
    const html = render({ heading: '<script>alert("x")</script>' });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("escapes user-supplied CTA href", () => {
    const html = render({ cta: { text: "Click", href: 'javascript:alert("x")' } });
    expect(html).toContain("javascript:alert(&quot;x&quot;)");
  });

  test("no flex layout (Outlook compatibility)", () => {
    expect(render()).not.toMatch(/display:\s*flex/);
  });

  test("no @import (Gmail/Outlook)", () => {
    expect(render()).not.toMatch(/@import/);
  });

  test("includes prefers-color-scheme light-mode media query", () => {
    const html = render();
    expect(html).toContain("@media (prefers-color-scheme:light)");
    expect(html).toContain("color-scheme");
  });

  test("elements have theme classes for light-mode overrides", () => {
    const html = render();
    expect(html).toContain("class=\"em-body\"");
    expect(html).toContain("class=\"em-card\"");
    expect(html).toContain("class=\"em-heading\"");
    expect(html).toContain("class=\"em-text\"");
    expect(html).toContain("class=\"em-footer\"");
  });

  test("body content is raw HTML (caller pre-escaped)", () => {
    const html = render({ body: '<ul><li style="color:#51cf66;">+ file.txt</li></ul>' });
    expect(html).toContain("+ file.txt");
    expect(html).toContain("color:#51cf66");
  });

  test("cta text is escaped", () => {
    const html = render({ cta: { text: '<img onerror="x">', href: "https://a.com" } });
    expect(html).toContain("&lt;img onerror=&quot;x&quot;&gt;");
  });
});
