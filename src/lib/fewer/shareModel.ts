import { isDangerousText } from "./textValidation";
import { emailShell } from "./emailTemplate";

/**
 * Pure model for the /api/share route (src/app/api/share/route.ts).
 * The route's input normalisation, static validation and response shaping
 * live here so they can be unit-tested without HTTP, a database or the
 * Resend client. Async orchestration (auth, DB upsert, invite emails)
 * stays in the route handlers.
 */

export type ShareAccess = "invite" | "public";

export interface ShareGalleryProps {
  in_gallery: boolean;
  gallery_title: string | null;
  gallery_description: string | null;
  author_name: string | null;
  author_username: string | null;
  gallery_category: string | null;
  gallery_categories: Record<string, number> | null;
  gallery_preview: { root: string; children: string[]; nodeCount: number } | null;
}

/** Count nodes in a graph payload (0 when the shape is unexpected). */
export function countNodes(data: unknown): number {
  return typeof data === "object" && data !== null
    && Array.isArray((data as { nodes?: unknown[] }).nodes)
    ? (data as { nodes: unknown[] }).nodes.length
    : 0;
}

/** Normalise the invited-emails list: strings only, trimmed, lowercased,
 *  non-empty. A non-array input yields an empty list. */
export function normalizeInvitedEmails(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

/** Static rejection for gallery opt-in text before it reaches the database —
 *  the same broken-token guard every user-text route enforces. Returns the
 *  400 error message, or null when the text is safe. */
export function galleryTextError(body: unknown): string | null {
  const b = body as Record<string, unknown> | null | undefined;
  const bad = (v: unknown) => v != null && isDangerousText(v);
  return bad(b?.gallery_title) || bad(b?.gallery_description) ? "Invalid gallery text" : null;
}

/** Gallery opt-in props (owned, public shares only). Metadata is surfaced on
 *  /api/gallery; broken text is rejected before it's stored. */
export function galleryProps(
  body: unknown,
  access: ShareAccess,
  userId: string | null,
): ShareGalleryProps {
  const b = (body ?? {}) as Record<string, unknown>;
  const inGallery = access === "public" && userId && b.in_gallery === true;
  const text = (v: unknown, cap: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : null;
  return inGallery
    ? {
        in_gallery: true,
        gallery_title: text(b.gallery_title, 200),
        gallery_description: text(b.gallery_description, 500),
        author_name: null,
        author_username: null,
        gallery_category: null,
        gallery_categories: null,
        gallery_preview: null,
      }
    : { in_gallery: false, gallery_title: null, gallery_description: null, author_name: null, author_username: null, gallery_category: null, gallery_categories: null, gallery_preview: null };
}

/** Absolute POSIX (`/x`), Windows drive (`C:\x`) or UNC (`\\server`) path. */
function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/**
 * Drop local-filesystem absolutes from a share payload (audit F-3) so a share
 * link never publishes the author's directory layout:
 *   - `localRootPath` is nulled (the one absolute field in every snapshot);
 *   - a node `data.path` that is absolute is relativized against that root
 *     when it matches — label-derived relative paths (the normal case) and
 *     hand-imported absolute paths without a known root are untouched;
 *   - an absolute `symlink.resolvedPath` is dropped (viewers cannot use it).
 * Non-object payloads pass through unchanged. Pure — safe for client dialogs
 * (hash shares) and the server route (DB shares) alike.
 */
export function stripShareLocalPaths<T>(data: T): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out = { ...(data as Record<string, unknown>) };
  const root =
    typeof out.localRootPath === "string"
      ? out.localRootPath.replace(/[\\/]+$/, "").replace(/\\/g, "/")
      : null;
  if ("localRootPath" in out) out.localRootPath = null;

  const relativize = (value: string): string => {
    const norm = value.replace(/\\/g, "/");
    if (!root) return value;
    if (norm === root) return ".";
    if (norm.startsWith(`${root}/`)) return norm.slice(root.length + 1);
    return value;
  };

  if (Array.isArray(out.nodes)) {
    out.nodes = (out.nodes as unknown[]).map((n) => {
      if (!n || typeof n !== "object" || Array.isArray(n)) return n;
      const node = { ...(n as Record<string, unknown>) };
      const d = node.data;
      if (!d || typeof d !== "object" || Array.isArray(d)) return node;
      const nd = { ...(d as Record<string, unknown>) };
      let touched = false;
      if (typeof nd.path === "string" && isAbsolutePath(nd.path)) {
        nd.path = relativize(nd.path);
        touched = true;
      }
      const sym = nd.symlink;
      if (sym && typeof sym === "object" && !Array.isArray(sym)) {
        const s = { ...(sym as Record<string, unknown>) };
        if (typeof s.resolvedPath === "string" && isAbsolutePath(s.resolvedPath)) {
          delete s.resolvedPath;
          nd.symlink = s;
          touched = true;
        }
      }
      if (touched) node.data = nd;
      return node;
    });
  }
  return out as T;
}

/** Graph name and inviter fallbacks for the invite email subject/body.
 *  The name is capped, never trimmed — it goes straight into the email. */
export function inviteContext(
  body: unknown,
  userEmail: string | undefined,
): { graphName: string; inviterEmail: string } {
  const b = body as { name?: unknown } | null | undefined;
  return {
    graphName: (b?.name ?? "a graph").toString().slice(0, 200),
    inviterEmail: userEmail ?? "a fewer user",
  };
}

/** Whether per-invitee invite emails should be sent: only for a freshly
 *  created invite-only share with at least one invitee. A reused share
 *  (stable link) keeps its existing invites. */
export function shouldSendInvites(reused: boolean, access: ShareAccess, invitedEmails: string[]): boolean {
  return !reused && access === "invite" && invitedEmails.length > 0;
}

/** Response body for POST /api/share. A reused share (stable link) also
 *  surfaces the stored gallery props; a fresh one reports the request's. */
export function shareResponseBody(
  id: string,
  access: ShareAccess,
  invitedEmails: string[],
  gallery: ShareGalleryProps,
  reused: boolean,
): Record<string, unknown> {
  return reused
    ? { id, access, invited_emails: invitedEmails, ...gallery }
    : { id, access, invited_emails: invitedEmails };
}

/** HTML body of the invite email. */
export function inviteEmailHtml(inviterEmail: string, graphName: string, link: string): string {
  return emailShell({
    preheader: `You're invited to view "${graphName}" on fewer`,
    heading: "You're invited to view a graph",
    intro: `${inviterEmail} shared "${graphName}" with you on fewer.`,
    body: "",
    cta: { text: "Open the graph", href: link },
    footnote: "This link is private: don't forward it. It works without an account.",
  });
}

/** Plain-text body of the invite email. */
export function inviteEmailText(inviterEmail: string, graphName: string, link: string): string {
  return `${inviterEmail} invited you to view "${graphName}" on fewer.\n\nOpen the graph: ${link}\n\nThis link is private: don't forward it.`;
}
