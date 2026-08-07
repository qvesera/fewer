import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/share/invite/<token>
 * Resolve an invite token to the shared graph data. The token is the
 * credential — no login required. Returns 404 if the token is invalid.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("share_invites")
      .select("share_id")
      .eq("token", token)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });

    // Mark used (idempotent — keep first use time).
    await supabase
      .from("share_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token)
      .is("used_at", null);

    // Fetch the shared graph.
    const { data: share, error: shareError } = await supabase
      .from("shared_graphs")
      .select("data, expires_at")
      .eq("id", data.share_id)
      .maybeSingle();

    if (shareError) return NextResponse.json({ error: shareError.message }, { status: 500 });
    if (!share) return NextResponse.json({ error: "Share not found" }, { status: 404 });

    // Lazy expiry.
    if (new Date(share.expires_at).getTime() < Date.now()) {
      await supabase.from("shared_graphs").delete().eq("id", data.share_id);
      return NextResponse.json({ error: "Share link expired" }, { status: 404 });
    }

    return NextResponse.json({ data: share.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}