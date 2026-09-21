import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/fewer/supabaseServer";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase } = authed;

  const { id } = await params;
  let body: { is_favorite?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.is_favorite !== "boolean") {
    return NextResponse.json({ error: "is_favorite must be a boolean" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("saved_graphs")
    .update({ is_favorite: body.is_favorite })
    .eq("id", id)
    .select("id, is_favorite")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ graph: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await getAuthedSupabase();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase } = authed;

  const { id } = await params;
  const { error } = await supabase.from("saved_graphs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}