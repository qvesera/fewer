import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
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

    const access = body?.access === "invite" ? "invite" : "public";
    const invitedEmails: string[] = Array.isArray(body?.invited_emails)
      ? body.invited_emails.filter((e: unknown) => typeof e === "string").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    const savedGraphId = body?.saved_graph_id ?? null;

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
          .update({ data, access, invited_emails: invitedEmails, expires_at: new Date(Date.now() + TTL_MS).toISOString() })
          .eq("id", existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ id: existing.id, access, invited_emails: invitedEmails });
      }
    }

    const id = randomBytes(6).toString("base64url"); // ~8 chars, URL-safe
    const { error } = await supabase.from("shared_graphs").insert({
      id,
      data,
      owner_id: user?.id ?? null,
      saved_graph_id: savedGraphId,
      access,
      invited_emails: invitedEmails,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Invite-only: create a per-email token and email each invitee a link.
    if (access === "invite" && invitedEmails.length > 0) {
      await sendInvites(supabase, id, invitedEmails);
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
async function sendInvites(supabase: Awaited<ReturnType<typeof getAuthed>>["supabase"], shareId: string, emails: string[]) {
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
        subject: "You've been invited to view a graph",
        html: `<p>Someone shared a graph with you on <strong>fewer</strong>.</p><p><a href="${link}">Open the graph</a></p><p>This link is private — don't forward it.</p>`,
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
      .select("id, access, invited_emails")
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