import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSupabaseCookieClient } from "@/lib/fewer/supabaseServer";
import { isShareExpired, serverError } from "@/lib/fewer/apiHelpers";

/** Resolve the current user's email from the session cookie, if any. */
async function getCurrentUserEmail(): Promise<string | null> {
  const supabase = await getSupabaseCookieClient();
  if (!supabase) return null;
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

    // Lazy expiry: if past expires_at (NULL = never expires), delete and 404.
    if (isShareExpired(data.expires_at)) {
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
    return serverError(err);
  }
}
