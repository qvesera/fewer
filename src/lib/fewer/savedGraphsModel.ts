import { graphDataEqual } from "./versions";
import { safeText } from "./textValidation";
import { isValidEmail } from "./authValidation";

/**
 * Pure model for the saved-graphs panel and its share dialog
 * (src/components/fewer/SavedGraphsPanel.tsx).
 *
 * The panel's decisions live here so they can be unit-tested without a DOM:
 * the save-name fallback, the update-noop check, the request bodies the panel
 * POSTs, the error-message rules, and the copy of every toast it shows. The
 * invite list also reuses the shared email check instead of a private copy of
 * the same regex.
 */

export type ShareAccessChoice = "none" | "public" | "invite";

/* -------------------------------------------------------------------------- */
/*  Save path                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Name to persist for a save: the sanitised input when non-empty, otherwise
 * the existing graph's name (update) or "Untitled" (new). A blank field never
 * overwrites an existing name.
 */
export function saveGraphName(raw: string, existingName: string | null): string {
  return safeText(raw) || (existingName ?? "Untitled");
}

/**
 * True when an in-place update would write a snapshot identical to the saved
 * one — the caller then skips the write and the redundant version row. A new
 * save always writes, so the flag is required to be true.
 */
export function graphSaveUnchanged(updating: boolean, data: unknown, savedData: unknown): boolean {
  return updating && graphDataEqual(data, savedData);
}

/**
 * Body for POST /api/graphs. An update carries the existing graph's id so the
 * API rewrites that row in place (keeping its share link) and records a new
 * version snapshot; a new save omits the id.
 */
export function buildGraphSaveBody(
  name: string,
  data: unknown,
  existingId: string | null,
): Record<string, unknown> {
  return existingId ? { id: existingId, name, data } : { name, data };
}

/**
 * Error message for a failed POST /api/graphs, or null when the response is
 * OK. Mirrors the API contract: the body's `error` string wins, else the
 * generic fallback.
 */
export function graphSaveError(res: { ok: boolean }, json: unknown): string | null {
  if (res.ok) return null;
  const body = json as { error?: unknown } | null | undefined;
  return typeof body?.error === "string" && body.error ? body.error : "Save failed";
}

/** Confirmation toast for a completed save (new graph or in-place update). */
export function saveSuccessToast(name: string, updating: boolean): { title: string; description: string } {
  return {
    title: updating ? "Graph updated" : "Saved",
    description: updating ? `"${name}" updated with a new version.` : `"${name}" saved to your account.`,
  };
}

/** Toast for an update that found the snapshot identical to the saved one. */
export function noChangesToast(name: string): { title: string; description: string } {
  return {
    title: "No changes",
    description: `"${name}" is already up to date — no new version was added.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Share path                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Split a comma-separated invite list into normalised emails and the malformed
 * entries, in input order. Entries are trimmed and lowercased and duplicates
 * dropped; the caller decides whether an invalid entry blocks the request.
 */
export function parseEmailList(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)) {
    if (!isValidEmail(entry)) {
      invalid.push(entry);
      continue;
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    emails.push(entry);
  }
  return { emails, invalid };
}

/**
 * Body for POST /api/share from the panel. The gallery opt-in only applies to
 * a signed-in (owned) public share; the API re-checks both, and the gallery
 * text is sanitised here the same way the route sanitises every stored field.
 */
export function buildShareRequestBody(params: {
  data: unknown;
  access: ShareAccessChoice;
  invitedEmails: string[];
  savedGraphId: string;
  name: string;
  gallery: boolean;
  galleryTitle: string;
  galleryDescription: string;
}): Record<string, unknown> {
  return {
    data: params.data,
    access: params.access,
    invited_emails: params.invitedEmails,
    saved_graph_id: params.savedGraphId,
    name: params.name,
    in_gallery: params.gallery && params.access === "public",
    gallery_title: safeText(params.galleryTitle),
    gallery_description: safeText(params.galleryDescription),
  };
}

/**
 * Error message for a failed POST /api/share, or null on success. A 2xx reply
 * without an id is a failure too — the caller needs the id to build the link.
 */
export function shareCreateError(res: { ok: boolean }, json: unknown): string | null {
  const body = json as { id?: unknown; error?: unknown } | null | undefined;
  if (res.ok && body?.id) return null;
  return typeof body?.error === "string" && body.error ? body.error : "Share failed";
}

/**
 * Confirmation toast after a share is created, per the mode that was chosen:
 * published (public + gallery opt-in) or invites sent (invite-only). A plain
 * public link confirms nothing — the link itself appears in the dialog.
 */
export function shareCreatedToast(opts: {
  access: ShareAccessChoice;
  gallery: boolean;
  galleryTitle: string;
  graphName: string;
  inviteeCount: number;
}): { title: string; description: string } | null {
  if (opts.gallery && opts.access === "public") {
    return {
      title: "Published to the gallery",
      description: `"${opts.galleryTitle.trim() || opts.graphName}" is now live in the community gallery.`,
    };
  }
  if (opts.access === "invite") {
    return {
      title: "Invites sent",
      description: `Emailed ${opts.inviteeCount} invitee${opts.inviteeCount === 1 ? "" : "s"} a private link.`,
    };
  }
  return null;
}
