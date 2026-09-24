import { describe, expect, it } from "bun:test";
import {
  countNodes,
  galleryProps,
  galleryTextError,
  inviteContext,
  inviteEmailHtml,
  inviteEmailText,
  normalizeInvitedEmails,
  shareResponseBody,
  shouldSendInvites,
} from "./shareModel";

// The /api/share route's pure decisions: payload normalisation, static
// validation, invite-email composition and response shaping.

describe("normalizeInvitedEmails", () => {
  it("keeps string entries only, trimmed and lowercased", () => {
    expect(normalizeInvitedEmails(["  Ada@Example.ORG ", "Bob", "", 42, null])).toEqual([
      "ada@example.org",
      "bob",
    ]);
  });

  it("returns an empty list for a non-array", () => {
    expect(normalizeInvitedEmails("bob@example.org")).toEqual([]);
    expect(normalizeInvitedEmails(undefined)).toEqual([]);
  });

  it("does not deduplicate — the caller sends one invite per entry", () => {
    expect(normalizeInvitedEmails(["a@x.org", "A@X.ORG"])).toEqual(["a@x.org", "a@x.org"]);
  });
});

describe("countNodes", () => {
  it("counts the payload's node array", () => {
    expect(countNodes({ nodes: [1, 2, 3] })).toBe(3);
  });

  it("is 0 for unexpected shapes", () => {
    expect(countNodes({ nodes: "nope" })).toBe(0);
    expect(countNodes({})).toBe(0);
    expect(countNodes(null)).toBe(0);
    expect(countNodes(undefined)).toBe(0);
  });
});

describe("galleryTextError", () => {
  it("rejects broken tokens before they are stored", () => {
    expect(galleryTextError({ gallery_title: "[object Object]" })).toBe("Invalid gallery text");
    expect(galleryTextError({ gallery_description: "null" })).toBe("Invalid gallery text");
  });

  it("allows real text and absent fields", () => {
    expect(galleryTextError({ gallery_title: "My graph" })).toBeNull();
    expect(galleryTextError({})).toBeNull();
    expect(galleryTextError(null)).toBeNull();
  });
});

describe("galleryProps", () => {
  const body = { in_gallery: true, gallery_title: "  T  ", gallery_description: "d".repeat(600) };

  it("opts in only for owned public shares, capped at 200/500 chars", () => {
    expect(galleryProps(body, "public", "u1")).toEqual({
      in_gallery: true,
      gallery_title: "T",
      gallery_description: "d".repeat(500),
    });
  });

  it("stays out for guests, invite shares and missing opt-in", () => {
    const out = { in_gallery: false, gallery_title: null, gallery_description: null };
    expect(galleryProps(body, "public", null)).toEqual(out);
    expect(galleryProps(body, "invite", "u1")).toEqual(out);
    expect(galleryProps({}, "public", "u1")).toEqual(out);
    expect(galleryProps(null, "public", "u1")).toEqual(out);
  });
});

describe("inviteContext", () => {
  it("caps the graph name without trimming it and falls back per field", () => {
    expect(inviteContext({ name: "  G  " }, "me@x.org")).toEqual({ graphName: "  G  ", inviterEmail: "me@x.org" });
    expect(inviteContext({}, "me@x.org")).toEqual({ graphName: "a graph", inviterEmail: "me@x.org" });
    expect(inviteContext({}, undefined)).toEqual({ graphName: "a graph", inviterEmail: "a fewer user" });
    expect(inviteContext({ name: "x".repeat(300) }, undefined).graphName).toBe("x".repeat(200));
  });
});

describe("shouldSendInvites", () => {
  it("sends only for a fresh invite-only share with invitees", () => {
    expect(shouldSendInvites(false, "invite", ["a@b.c"])).toBe(true);
    expect(shouldSendInvites(true, "invite", ["a@b.c"])).toBe(false);
    expect(shouldSendInvites(false, "public", ["a@b.c"])).toBe(false);
    expect(shouldSendInvites(false, "invite", [])).toBe(false);
  });
});

describe("shareResponseBody", () => {
  const gallery = { in_gallery: true, gallery_title: "T", gallery_description: null };

  it("a reused share surfaces the stored gallery props", () => {
    expect(shareResponseBody("id1", "public", ["a@b.c"], gallery, true)).toEqual({
      id: "id1",
      access: "public",
      invited_emails: ["a@b.c"],
      in_gallery: true,
      gallery_title: "T",
      gallery_description: null,
    });
  });

  it("a fresh share reports only the link identity", () => {
    expect(shareResponseBody("id1", "public", ["a@b.c"], gallery, false)).toEqual({
      id: "id1",
      access: "public",
      invited_emails: ["a@b.c"],
    });
  });
});

describe("invite email bodies", () => {
  it("the text body embeds inviter, graph and token link", () => {
    expect(inviteEmailText("me@x.org", "My Graph", "https://app/#i:tok")).toBe(
      'me@x.org invited you to view "My Graph" on fewer.\n\nOpen the graph: https://app/#i:tok\n\nThis link is private — don\'t forward it.',
    );
  });

  it("the html body embeds the inviter and the token link", () => {
    const html = inviteEmailHtml("me@x.org", "G", "https://app/#i:t");
    expect(html).toContain("me@x.org");
    expect(html).toContain("https://app/#i:t");
  });

  it("the html body uses the email shell with correct branding", () => {
    const html = inviteEmailHtml("me@x.org", "G", "https://app/#i:t");
    expect(html).toContain("fewer");
    expect(html).toContain(".directory");
    expect(html).toContain("Interactive File &amp; System Graph Visualizer");
    expect(html).toContain("Open the graph");
    expect(html).toContain("font-weight:600");
  });
});
