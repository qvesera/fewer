import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/share/invite/<token>
 * Resolve an invite token to the shared graph data via a SECURITY DEFINER
 * function. The token is the credential — no login required and no RLS
 * loosening. Returns 404 if the token is invalid or the share expired.
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
    const { data, error } = await supabase.rpc("get_shared_graph_by_token", { p_token: token });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 });

    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
