import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { isDangerousText } from "@/lib/fewer/textValidation";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";
import { getSupabaseCookieClient } from "@/lib/fewer/supabaseServer";
import { serverError } from "@/lib/fewer/apiHelpers";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SHARE_FREE_MAX_CHARS = 200_000;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "fewer <onboarding@resend.dev>";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

type Authed = { supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseCookieClient>>>; user: User | null };
type User = { id: string; email?: string };
/**
 * Build an authed Supabase client from the session cookie and return it with
 * the current user (null for guests — guests can still share small graphs).
 */
async function getAuthed(): Promise<Authed | null> {
  const supabase = await getSupabaseCookieClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null };
}

/** Plan rejection for share creation, or null when allowed. Guests are
 *  rejected earlier; both plan checks share one getUserPlan call. */
async function sharePlanError(
  supabase: Authed["supabase"],
  userId: string,
  payloadChars: number,
  access: "invite" | "public",
): Promise<{ error: string; status: 403; code: "plan_limit" } | null> {
  const planLimits = limitsFor(await getUserPlan(supabase, userId));
  if (payloadChars > SHARE_FREE_MAX_CHARS && planLimits.largeShareLinks === false) {
    return {
      error: "This graph is too large to share on the Free plan -- short links for large payloads are Pro. See /docs/plans.",
      status: 403,
      code: "plan_limit",
    };
  }
  // Invite-only sharing is a Pro feature (Resend emails per invitee have
  // real cost). Public "anyone with the link" sharing stays free.
  if (access === "invite" && !planLimits.inviteSharing) {
    return {
      error: "Invite-only sharing is a Pro feature. Public links stay free.",
      status: 403,
      code: "plan_limit",
    };
  }
  return null;
}

/** Count nodes in a graph payload (0 when the shape is unexpected). */
function countNodes(data: unknown): number {
  return typeof data === "object" && data !== null
    && Array.isArray((data as { nodes?: unknown[] }).nodes)
    ? (data as { nodes: unknown[] }).nodes.length
    : 0;
}

/** Pure: gallery opt-in props (owned, public shares only). Metadata is
 *  surfaced on /api/gallery; broken text is rejected before it's stored. */
function galleryProps(
  body: Record<string, unknown> | null,
  access: "invite" | "public",
  userId: string | null,
): { in_gallery: boolean; gallery_title: string | null; gallery_description: string | null } {
  const inGallery = access === "public" && userId && body?.in_gallery === true;
  return inGallery
    ? {
        in_gallery: true,
        gallery_title: typeof body?.gallery_title === "string" && body.gallery_title.trim()
          ? body.gallery_title.trim().slice(0, 200)
          : null,
        gallery_description: typeof body?.gallery_description === "string" && body.gallery_description.trim()
          ? body.gallery_description.trim().slice(0, 500)
          : null,
      }
    : { in_gallery: false, gallery_title: null, gallery_description: null };
}

/** Invite-only: create a per-email token for each invitee and email them a
 *  link. Token is the credential — the link works without login. */
async function sendInvites(supabase: Authed["supabase"], shareId: string, emails: string[], graphName: string, inviterEmail: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping invite emails");
    return;
  }
  const resend = new Resend(resendKey);

  for (const email of emails) {
    const token = randomBytes(24).toString("base64url");
    const { error } = await supabase.from("share_invites").insert({ share_id: shareId, email, token });
    if (error) {
      console.warn(`Failed to create invite for ${email}:`, error.message);
      continue;
    }
    const link = `${APP_ORIGIN}/#i:${token}`;
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject: `You're invited to view "${graphName}"`,
        html: inviteEmailHtml(inviterEmail, graphName, link),
        text: inviteEmailText(inviterEmail, graphName, link),
      });
    } catch (err) {
      console.warn(`Failed to email ${email}:`, err instanceof Error ? err.message : err);
    }
  }
}

/** HTML body of the invite email (pure). */
function inviteEmailHtml(inviterEmail: string, graphName: string, link: string): string {
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

/** Plain-text body of the invite email (pure). */
function inviteEmailText(inviterEmail: string, graphName: string, link: string): string {
  return `${inviterEmail} invited you to view "${graphName}" on fewer.\n\nOpen the graph: ${link}\n\nThis link is private — don't forward it.`;
}

/**
 * POST /api/share
 * Create or update a share link. When a logged-in user shares a saved graph
 * (saved_graph_id present), the same row is reused so the link stays stable.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = body?.data;
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Missing graph data" }, { status: 400 });
    }

    const authed = await getAuthed();
    const user = authed?.user ?? null;
    const supabase = authed?.supabase;
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json(
        { error: "Sign in to create share links. Guests can share small graphs with the encoded link.", code: "plan_limit" },
        { status: 403 },
      );
    }

    const access = body?.access === "invite" ? "invite" : "public";
    const plan = await sharePlanError(supabase, user.id, JSON.stringify(data).length, access);
    if (plan) {
      return NextResponse.json({ error: plan.error, code: plan.code }, { status: plan.status });
    }

    // Reject broken gallery text (e.g. "[object Object]") before it's stored.
    const badGallery = (v: unknown) => v != null && isDangerousText(v);
    if (badGallery(body?.gallery_title) || badGallery(body?.gallery_description)) {
      return NextResponse.json({ error: "Invalid gallery text" }, { status: 400 });
    }

    const invitedEmails: string[] = Array.isArray(body?.invited_emails)
      ? body.invited_emails.filter((e: unknown) => typeof e === "string").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    const savedGraphId = body?.saved_graph_id ?? null;
    const gallery = galleryProps(body, access, user.id);

    const { id, reused } = await upsertShare(supabase, {
      data,
      userId: user.id,
      savedGraphId,
      access,
      nodeCount: countNodes(data),
      invitedEmails,
      gallery,
    });

    // Invite-only: create a per-email token and email each invitee a link.
    if (!reused && access === "invite" && invitedEmails.length > 0) {
      const graphName = (body?.name ?? "a graph").toString().slice(0, 200);
      const inviterEmail = user.email ?? "a fewer user";
      await sendInvites(supabase, id, invitedEmails, graphName, inviterEmail);
    }

    return reused
      ? NextResponse.json({ id, access, invited_emails: invitedEmails, ...gallery })
      : NextResponse.json({ id, access, invited_emails: invitedEmails });
  } catch (err) {
    return serverError(err);
  }
}

/** Create the share row, or reuse the existing share for this owner + saved
 *  graph (stable link). Returns the row id and whether an existing share was
 *  updated in place. Signed-in shares never expire; guest rows expire after
 *  30 days (guests are rejected earlier, so reuse is signed-in only). */
async function upsertShare(
  supabase: Authed["supabase"],
  params: {
    data: unknown;
    userId: string | null;
    savedGraphId: string | null;
    access: "invite" | "public";
    nodeCount: number;
    invitedEmails: string[];
    gallery: { in_gallery: boolean; gallery_title: string | null; gallery_description: string | null };
  },
): Promise<{ id: string; reused: boolean }> {
  if (params.userId && params.savedGraphId) {
    const { data: existing } = await supabase
      .from("shared_graphs")
      .select("id")
      .eq("owner_id", params.userId)
      .eq("saved_graph_id", params.savedGraphId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("shared_graphs")
        .update({ data: params.data, access: params.access, node_count: params.nodeCount, invited_emails: params.invitedEmails, expires_at: null, ...params.gallery })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, reused: true };
    }
  }

  const id = randomBytes(6).toString("base64url"); // ~8 chars, URL-safe
  const { error } = await supabase.from("shared_graphs").insert({
    id,
    data: params.data,
    owner_id: params.userId,
    saved_graph_id: params.savedGraphId,
    access: params.access,
    node_count: params.nodeCount,
    invited_emails: params.invitedEmails,
    expires_at: params.userId ? null : new Date(Date.now() + TTL_MS).toISOString(),
    ...params.gallery,
  });
  if (error) throw new Error(error.message);
  return { id, reused: false };
}

/**
 * GET /api/share?saved_graph_id=<id>
 * Fetch the existing share for a saved graph (owner only). Returns 404 if none.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const savedGraphId = searchParams.get("saved_graph_id");
    if (!savedGraphId) {
      return NextResponse.json({ error: "Missing saved_graph_id" }, { status: 400 });
    }

    const authed = await getAuthed();
    if (!authed?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { supabase, user } = authed;

    const { data, error } = await supabase
      .from("shared_graphs")
      .select("id, access, invited_emails, in_gallery, gallery_title, gallery_description")
      .eq("owner_id", user.id)
      .eq("saved_graph_id", savedGraphId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No share link" }, { status: 404 });
    return NextResponse.json({ share: data });
  } catch (err) {
    return serverError(err);
  }
}

/**
 * DELETE /api/share?saved_graph_id=<id>
 * Remove the share link for a saved graph (owner only). Unshare.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const savedGraphId = searchParams.get("saved_graph_id");
    if (!savedGraphId) {
      return NextResponse.json({ error: "Missing saved_graph_id" }, { status: 400 });
    }

    const authed = await getAuthed();
    if (!authed?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { supabase, user } = authed;

    const { error } = await supabase
      .from("shared_graphs")
      .delete()
      .eq("owner_id", user.id)
      .eq("saved_graph_id", savedGraphId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}