import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";
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
  type ShareAccess,
  type ShareGalleryProps,
} from "@/lib/fewer/shareModel";
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
      error: "This graph is too large to share on the Free plan -- short links for large payloads are Pro.",
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

/** Send one invitee their per-email token link. A failed token insert or a
 *  failed email warns and moves on — one bad invitee must not block others. */
async function sendInvite(
  supabase: Authed["supabase"],
  resend: Resend,
  invite: { shareId: string; email: string; graphName: string; inviterEmail: string },
) {
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("share_invites").insert({ share_id: invite.shareId, email: invite.email, token });
  if (error) {
    console.warn(`Failed to create invite for ${invite.email}:`, error.message);
    return;
  }
  const link = `${APP_ORIGIN}/#i:${token}`;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [invite.email],
      subject: `You're invited to view "${invite.graphName}"`,
      html: inviteEmailHtml(invite.inviterEmail, invite.graphName, link),
      text: inviteEmailText(invite.inviterEmail, invite.graphName, link),
    });
  } catch (err) {
    console.warn(`Failed to email ${invite.email}:`, err instanceof Error ? err.message : err);
  }
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
    await sendInvite(supabase, resend, { shareId, email, graphName, inviterEmail });
  }
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
    const galleryError = galleryTextError(body);
    if (galleryError) {
      return NextResponse.json({ error: galleryError }, { status: 400 });
    }

    const invitedEmails = normalizeInvitedEmails(body?.invited_emails);
    const savedGraphId = body?.saved_graph_id ?? null;
    const gallery = galleryProps(body, access, user.id);

    // Derive card metadata (category histogram, preview, author attribution)
    // server-side from the payload so /api/gallery stays metadata-only.
    if (gallery.in_gallery) {
      const { deriveCardMeta } = await import("@/lib/fewer/galleryCategories");
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, username")
        .eq("user_id", user.id)
        .maybeSingle();
      const nodes = Array.isArray(data.nodes) ? (data.nodes as never[]) : [];
      const cardMeta = deriveCardMeta(nodes, profile);
      Object.assign(gallery, cardMeta);
    }

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
    if (shouldSendInvites(reused, access, invitedEmails)) {
      const { graphName, inviterEmail } = inviteContext(body, user.email);
      await sendInvites(supabase, id, invitedEmails, graphName, inviterEmail);
    }

    return NextResponse.json(shareResponseBody(id, access, invitedEmails, gallery, reused));
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
    access: ShareAccess;
    nodeCount: number;
    invitedEmails: string[];
    gallery: ShareGalleryProps;
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