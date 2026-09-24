import { describe, expect, test } from "bun:test";
import { digestHtml, digestText } from "./watchDigest";

describe("digest email bodies", () => {
  const changes = [
    { url: "https://example.com/index.html", added: ["file1.txt", "file2.txt"], removed: ["old.txt"] },
  ];

  test("the text body embeds URL, added, removed", () => {
    const text = digestText(changes);
    expect(text).toContain("https://example.com/index.html");
    expect(text).toContain("+ file1.txt");
    expect(text).toContain("- old.txt");
  });

  test("the html body uses the email shell", () => {
    const html = digestHtml(changes);
    expect(html).toContain("fewer");
    expect(html).toContain(".directory");
    expect(html).toContain("Interactive File &amp; System Graph Visualizer");
    expect(html).toContain("Daily directory changes");
  });

  test("the html body embeds added/removed files with colors", () => {
    const html = digestHtml(changes);
    expect(html).toContain("color:#51cf66");
    expect(html).toContain("+ file1.txt");
    expect(html).toContain("color:#ff6b6b");
    expect(html).toContain("− old.txt");
  });

  test("the html body escapes user-provided URLs", () => {
    const changes = [
      { url: 'https://evil.com/<script>alert("x")</script>', added: ["file1.txt"], removed: [] },
    ];
    const html = digestHtml(changes);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("the html body escapes user-provided file paths", () => {
    const changes = [
      { url: "https://example.com", added: ['<img onerror="x">'], removed: [] },
    ];
    const html = digestHtml(changes);
    expect(html).toContain("&lt;img onerror=&quot;x&quot;&gt;");
    expect(html).toContain("+ &lt;img onerror=&quot;x&quot;&gt;");
  });
});