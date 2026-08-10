import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Resolve the current user's email from the session cookie, if any. */
async function getCurrentUserEmail(): Promise<string | null> {
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
  return data.user?.email ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("shared_graphs")
      .select("data, expires_at, access, invited_emails")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Share link not found or expired" }, { status: 404 });
    }

    // Lazy expiry: if past expires_at, delete and 404.
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await supabase.from("shared_graphs").delete().eq("id", id);
      return NextResponse.json({ error: "Share link not found or expired" }, { status: 404 });
    }

    // Invite-only: require a signed-in user whose email is invited.
    if (data.access === "invite") {
      const email = await getCurrentUserEmail();
      const invited = (data.invited_emails ?? []) as string[];
      if (!email || !invited.includes(email.toLowerCase())) {
        return NextResponse.json(
          { error: "This graph is invite-only. Sign in with an invited email to view it." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ data: data.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
