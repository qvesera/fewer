import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabase } from "@/lib/supabase";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = body?.data;
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Missing graph data" }, { status: 400 });
    }

    const id = randomBytes(6).toString("base64url"); // ~8 chars, URL-safe
    const supabase = getSupabase();
    const { error } = await supabase.from("shared_graphs").insert({
      id,
      data,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}