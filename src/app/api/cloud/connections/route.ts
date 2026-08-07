import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/fewer/cloud/server";
import type { CloudConnection } from "@/lib/fewer/cloud/types";

/** List the current user's linked cloud accounts (no tokens). */
export async function GET() {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase } = authed;

  const { data, error } = await supabase
    .from("cloud_connections")
    .select("id, provider, account_id, account_name, config, created_at, updated_at")
    .order("provider", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: (data ?? []) as CloudConnection[] });
}

/** Unlink a connection (owner-only via RLS). */
export async function DELETE(request: Request) {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;

  let id: string;
  try {
    const body = await request.json();
    id = String(body.id ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("cloud_connections").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}