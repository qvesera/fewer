import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/fewer/apiAuth";
import { safeText } from "@/lib/fewer/textValidation";
import { profileFieldsRejected } from "@/lib/fewer/apiHelpers";
import { countOwned } from "@/lib/fewer/plans";

export async function GET() {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;

  const { data, error } = await supabase
    .from("profiles")
    // plan is SELECT-able by its owner (0022 only column-revoked INSERT/UPDATE)
    .select("first_name, last_name, username, plan")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Usage counters for the Account-status card (head-count, fails -1 on error).
  const [savedGraphs, watchedIndexes] = await Promise.all([
    countOwned(supabase, "saved_graphs", user.id),
    countOwned(supabase, "watched_indexes", user.id),
  ]);

  return NextResponse.json({ profile: data ?? null, counts: { savedGraphs, watchedIndexes } });
}

export async function PUT(request: Request) {
  const authed = await getAuthedClient();
  if (!authed) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = authed;

  let body: { first_name?: unknown; last_name?: unknown; username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const first_name = safeText(body.first_name);
  const last_name = safeText(body.last_name);
  // Store usernames normalized to lowercase so uniqueness is enforced
  // case-insensitively (matches the profiles_username_unique_idx index).
  const username = safeText(body.username).toLowerCase();

  const rejectReason = profileFieldsRejected(body);
  if (rejectReason) return NextResponse.json({ error: rejectReason }, { status: 400 });

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, first_name, last_name, username }, { onConflict: "user_id" });

  if (error) {
    // 23505 = unique_violation, from the profiles_username_unique_idx index.
    if (error.code === "23505") {
      return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}