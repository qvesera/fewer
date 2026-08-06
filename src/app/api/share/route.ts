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

    const id = randomBytes(6).toString("base64url"); // ~8 chars, URL-safe
    const supabase = getSupabase();
    const { error } = await supabase.from("shared_graphs").insert({
      id,
      data,
      owner_id: user?.id ?? null,
      saved_graph_id: body?.saved_graph_id ?? null,
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
