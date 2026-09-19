import { describe, expect, it } from "bun:test";
import {
  buildGraphSaveBody,
  buildShareRequestBody,
  graphSaveError,
  graphSaveUnchanged,
  noChangesToast,
  parseEmailList,
  saveGraphName,
  saveSuccessToast,
  shareCreateError,
  shareCreatedToast,
} from "./savedGraphsModel";

// The saved-graphs panel's pure decisions: save naming, the update-noop rule,
// request bodies, response-error rules and every toast the panel shows.

describe("saveGraphName", () => {
  it("trims the input and sanitises dangerous tokens", () => {
    expect(saveGraphName("  My graph  ", null)).toBe("My graph");
    expect(saveGraphName("null", "Existing")).toBe("Existing");
    expect(saveGraphName("[object Object]", null)).toBe("Untitled");
  });

  it("falls back to the existing name on an update, Untitled on a new save", () => {
    expect(saveGraphName("   ", "Existing")).toBe("Existing");
    expect(saveGraphName("", null)).toBe("Untitled");
  });

  it("keeps an existing empty name rather than inventing Untitled", () => {
    expect(saveGraphName("", "")).toBe("");
  });
});

describe("graphSaveUnchanged", () => {
  const data = { nodes: [{ id: "n1", data: { label: "x" } }] };

  it("only an update can be unchanged — a new save always writes", () => {
    expect(graphSaveUnchanged(true, data, { nodes: [{ id: "n1", data: { label: "x" } }] })).toBe(true);
    expect(graphSaveUnchanged(false, data, { nodes: [{ id: "n1", data: { label: "x" } }] })).toBe(false);
  });

  it("a changed snapshot writes", () => {
    expect(graphSaveUnchanged(true, data, { nodes: [] })).toBe(false);
  });
});

describe("buildGraphSaveBody", () => {
  it("an update carries the id so the API rewrites the row in place", () => {
    expect(buildGraphSaveBody("G", { nodes: [] }, "id-1")).toEqual({
      id: "id-1",
      name: "G",
      data: { nodes: [] },
    });
  });

  it("a new save omits the id", () => {
    expect(buildGraphSaveBody("G", { nodes: [] }, null)).toEqual({ name: "G", data: { nodes: [] } });
  });
});

describe("graphSaveError", () => {
  it("is null for an OK response", () => {
    expect(graphSaveError({ ok: true }, {})).toBeNull();
  });

  it("surfaces the API's message, else the generic fallback", () => {
    expect(graphSaveError({ ok: false }, { error: "Too many graphs" })).toBe("Too many graphs");
    expect(graphSaveError({ ok: false }, {})).toBe("Save failed");
    expect(graphSaveError({ ok: false }, null)).toBe("Save failed");
    expect(graphSaveError({ ok: false }, { error: "" })).toBe("Save failed");
    expect(graphSaveError({ ok: false }, { error: 42 })).toBe("Save failed");
  });
});

describe("save toasts", () => {
  it("new vs update confirm differently", () => {
    expect(saveSuccessToast("G", false)).toEqual({ title: "Saved", description: '"G" saved to your account.' });
    expect(saveSuccessToast("G", true)).toEqual({
      title: "Graph updated",
      description: '"G" updated with a new version.',
    });
  });

  it("an unchanged update says so and names the graph", () => {
    expect(noChangesToast("G")).toEqual({
      title: "No changes",
      description: '"G" is already up to date — no new version was added.',
    });
  });
});

describe("parseEmailList", () => {
  it("trims, lowercases and splits a comma-separated list", () => {
    expect(parseEmailList(" A@x.com , b@x.com ")).toEqual({ emails: ["a@x.com", "b@x.com"], invalid: [] });
  });

  it("drops duplicates after normalisation", () => {
    expect(parseEmailList("a@x.com, A@X.COM")).toEqual({ emails: ["a@x.com"], invalid: [] });
  });

  it("reports malformed entries separately, keeping the valid ones", () => {
    expect(parseEmailList("a@x.com, nope, b@x.com")).toEqual({
      emails: ["a@x.com", "b@x.com"],
      invalid: ["nope"],
    });
  });

  it("is empty for blank input", () => {
    expect(parseEmailList("")).toEqual({ emails: [], invalid: [] });
    expect(parseEmailList(" , ,")).toEqual({ emails: [], invalid: [] });
  });
});

describe("buildShareRequestBody", () => {
  const base = {
    data: { nodes: [] },
    invitedEmails: ["a@x.com"],
    savedGraphId: "g1",
    name: "G",
    galleryTitle: "  Title  ",
    galleryDescription: "  Desc  ",
  };

  it("a public gallery share opts in with sanitised text", () => {
    expect(buildShareRequestBody({ ...base, access: "public", gallery: true })).toEqual({
      data: { nodes: [] },
      access: "public",
      invited_emails: ["a@x.com"],
      saved_graph_id: "g1",
      name: "G",
      in_gallery: true,
      gallery_title: "Title",
      gallery_description: "Desc",
    });
  });

  it("gallery opt-in requires a public share", () => {
    expect(buildShareRequestBody({ ...base, access: "invite", gallery: true }).in_gallery).toBe(false);
    expect(buildShareRequestBody({ ...base, access: "public", gallery: false }).in_gallery).toBe(false);
  });

  it("passes the chosen access through untouched", () => {
    expect(buildShareRequestBody({ ...base, access: "none", gallery: false }).access).toBe("none");
    expect(buildShareRequestBody({ ...base, access: "invite", gallery: false }).access).toBe("invite");
  });
});

describe("shareCreateError", () => {
  it("is null only for an OK response carrying an id", () => {
    expect(shareCreateError({ ok: true }, { id: "abc" })).toBeNull();
    expect(shareCreateError({ ok: true }, {})).toBe("Share failed");
    expect(shareCreateError({ ok: true }, { id: "" })).toBe("Share failed");
  });

  it("surfaces the API's message, else the generic fallback", () => {
    expect(shareCreateError({ ok: false }, { error: "Too large" })).toBe("Too large");
    expect(shareCreateError({ ok: false }, {})).toBe("Share failed");
  });
});

describe("shareCreatedToast", () => {
  it("public gallery shares confirm the publish, titled by the gallery title", () => {
    expect(
      shareCreatedToast({ access: "public", gallery: true, galleryTitle: "  T  ", graphName: "G", inviteeCount: 0 }),
    ).toEqual({
      title: "Published to the gallery",
      description: '"T" is now live in the community gallery.',
    });
    expect(
      shareCreatedToast({ access: "public", gallery: true, galleryTitle: "", graphName: "G", inviteeCount: 0 }),
    ).toEqual({
      title: "Published to the gallery",
      description: '"G" is now live in the community gallery.',
    });
  });

  it("invite shares count their invitees with correct pluralisation", () => {
    expect(
      shareCreatedToast({ access: "invite", gallery: false, galleryTitle: "", graphName: "G", inviteeCount: 1 }),
    ).toEqual({ title: "Invites sent", description: "Emailed 1 invitee a private link." });
    expect(
      shareCreatedToast({ access: "invite", gallery: false, galleryTitle: "", graphName: "G", inviteeCount: 3 }),
    ).toEqual({ title: "Invites sent", description: "Emailed 3 invitees a private link." });
  });

  it("is silent for a plain public link and for no access choice", () => {
    expect(shareCreatedToast({ access: "public", gallery: false, galleryTitle: "", graphName: "G", inviteeCount: 0 })).toBeNull();
    expect(shareCreatedToast({ access: "none", gallery: false, galleryTitle: "", graphName: "G", inviteeCount: 0 })).toBeNull();
  });
});
