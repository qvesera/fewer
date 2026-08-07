import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Resolve the current user from the session cookie, if any. */
async function getCurrentUser() {
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
  return data.user ?? null;
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

    const user = await getCurrentUser();
    const access = body?.access === "invite" ? "invite" : "public";
    const invitedEmails: string[] = Array.isArray(body?.invited_emails)
      ? body.invited_emails.filter((e: unknown) => typeof e === "string").map((e: string) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    const savedGraphId = body?.saved_graph_id ?? null;

    const supabase = getSupabase();

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

    return NextResponse.json({ id, access, invited_emails: invitedEmails });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
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

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const supabase = getSupabase();
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

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const supabase = getSupabase();
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