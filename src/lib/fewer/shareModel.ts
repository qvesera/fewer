import { isDangerousText } from "./textValidation";

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
      }
    : { in_gallery: false, gallery_title: null, gallery_description: null };
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
  return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0b0b13;padding:32px 16px;">
        <div style="max-width:480px;margin:0 auto;background:#16161f;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">
          <div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:20px;">🗂️</span>
              <span style="font-size:18px;font-weight:700;color:#f8f9fa;">fewer</span>
            </div>
          </div>
          <div style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:20px;color:#f8f9fa;">You're invited to view a graph</h1>
            <p style="margin:0 0 20px;font-size:14px;color:#adb5bd;line-height:1.5;">
              <strong style="color:#f8f9fa;">${inviterEmail}</strong> shared <strong style="color:#f8f9fa;">"${graphName}"</strong> with you on fewer.
            </p>
            <a href="${link}" style="display:inline-block;background:#fd7e14;color:#1e293b;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">
              Open the graph
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#868e96;line-height:1.5;">
              This link is private — don't forward it. It works without an account.
            </p>
          </div>
          <div style="padding:16px 32px;border-top:1px solid #2a2a3a;text-align:center;">
            <span style="font-size:12px;color:#868e96;">fewer · Interactive File & System Graph Visualizer</span>
          </div>
        </div>
      </div>
    `;
}

/** Plain-text body of the invite email. */
export function inviteEmailText(inviterEmail: string, graphName: string, link: string): string {
  return `${inviterEmail} invited you to view "${graphName}" on fewer.\n\nOpen the graph: ${link}\n\nThis link is private — don't forward it.`;
}
