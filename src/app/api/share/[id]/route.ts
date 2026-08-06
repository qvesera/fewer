import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

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
      .select("data, expires_at")
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

    return NextResponse.json({ data: data.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}