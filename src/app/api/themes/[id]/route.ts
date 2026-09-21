import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/fewer/supabaseServer";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase } = authed;

  const { id } = await params;
  // Owner-only via RLS. Guards against forged ids / other users' rows.
  const { data, error } = await supabase.from("saved_themes").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
