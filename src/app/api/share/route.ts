import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { isDangerousText } from "@/lib/fewer/textValidation";
import { getUserPlan, limitsFor } from "@/lib/fewer/plans";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SHARE_FREE_MAX_CHARS = 200_000;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "fewer <onboarding@resend.dev>";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Build an authed Supabase client from the session cookie and return it with
 * the current user. Using the authed client (not the anon key) attaches the
 * user's JWT so RLS sees auth.uid() — required for owner-scoped policies.
 */
async function getAuthed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* ignore */
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null };
}

type Authed = NonNullable<Awaited<ReturnType<typeof getAuthed>>>;

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
    const payloadChars = JSON.stringify(data).length;
    const planLimits = limitsFor(await getUserPlan(supabase, user.id));
    if (payloadChars > SHARE_FREE_MAX_CHARS && planLimits.largeShareLinks === false) {
      return NextResponse.json(
        { error: "This graph is too large to share on the Free plan -- short links for large payloads are Pro. See /docs/plans.", code: "plan_limit" },
        { status: 403 },
      );
    }
    const access = body?.access === "invite" ? "invite" : "public";
    const invitedEmails: string[] = Array.isArray(body?.invited_emails)
      ? body.invited_emails.filter((e: unknown) => typeof e === "string").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    const savedGraphId = body?.saved_graph_id ?? null;

    // Invite-only sharing is a Pro feature (Resend emails per invitee have
    // real cost). Public "anyone with the link" sharing stays free.
    if (access === "invite" && user && !limitsFor(await getUserPlan(supabase, user.id)).inviteSharing) {
      return NextResponse.json(
        {
          error: "Invite-only sharing is a Pro feature. Public links stay free.",
          code: "plan_limit",
        },
        { status: 403 },
      );
    }

    // Reject broken gallery text (e.g. "[object Object]") before it's stored.
    const badGallery = (v: unknown) => v != null && isDangerousText(v);
    if (badGallery(body?.gallery_title) || badGallery(body?.gallery_description)) {
      return NextResponse.json({ error: "Invalid gallery text" }, { status: 400 });
    }

    // Gallery opt-in (owned, public shares only). Metadata surfaced on /api/gallery.
    const inGallery = access === "public" && user?.id && body?.in_gallery === true;
    const nodeCount =
      typeof body?.data === "object" && body?.data !== null
        && Array.isArray((body.data as { nodes?: unknown[] }).nodes)
        ? (body.data as { nodes: unknown[] }).nodes.length
        : 0;
    const gallery_props = inGallery
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

    // Reuse existing share for this owner + saved graph (stable link).
    if (user && savedGraphId) {
      const { data: existing } = await supabase
        .from("shared_graphs")
        .select("id")
        .eq("owner_id", user.id)
        .eq("saved_graph_id", savedGraphId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("shared_graphs")
          .update({ data, access, node_count: nodeCount, invited_emails: invitedEmails, expires_at: user ? null : new Date(Date.now() + TTL_MS).toISOString(), ...gallery_props })
          .eq("id", existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ id: existing.id, access, invited_emails: invitedEmails, ...gallery_props });
      }
    }

    const id = randomBytes(6).toString("base64url"); // ~8 chars, URL-safe
    const { error } = await supabase.from("shared_graphs").insert({
      id,
      data,
      owner_id: user?.id ?? null,
      saved_graph_id: savedGraphId,
      access,
      node_count: nodeCount,
      invited_emails: invitedEmails,
      expires_at: user ? null : new Date(Date.now() + TTL_MS).toISOString(),
      ...gallery_props,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Invite-only: create a per-email token and email each invitee a link.
    if (access === "invite" && invitedEmails.length > 0) {
      const graphName = (body?.name ?? "a graph").toString().slice(0, 200);
      const inviterEmail = user?.email ?? "a fewer user";
      await sendInvites(supabase, id, invitedEmails, graphName, inviterEmail);
    }

    return NextResponse.json({ id, access, invited_emails: invitedEmails });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Create a per-email token for each invitee and email them a link.
 * Token is the credential — the link works without login.
 */
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
    const html = `
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
    const text = `${inviterEmail} invited you to view "${graphName}" on fewer.\n\nOpen the graph: ${link}\n\nThis link is private — don't forward it.`;
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject: `You're invited to view "${graphName}"`,
        html,
        text,
      });
    } catch (err) {
      console.warn(`Failed to email ${email}:`, err instanceof Error ? err.message : err);
    }
  }
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}