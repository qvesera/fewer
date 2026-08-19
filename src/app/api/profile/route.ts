import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isDangerousText, safeText, validateUsername } from "@/lib/fewer/textValidation";

/**
 * Per-account profile info (first/last name, username) from Settings → Account.
 * One row in `profiles`, keyed by user_id. RLS enforces owner-only reads/writes
 * from the session cookie (upsert inserts for a new row, updates an existing one).
 */
async function getAuthedClient() {
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
  if (!data.user) return null;
  return { supabase, user: data.user };
}

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
  return NextResponse.json({ profile: data ?? null });
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

  // Server-side guard: reject broken values and usernames containing "@"
  // (an "@" in a username would break email-vs-username login detection).
  const bad = (v: unknown) => v !== undefined && v !== null && isDangerousText(v);
  const usernameError = validateUsername(username, { label: "Username", max: 100 });
  if (
    bad(body.first_name) ||
    bad(body.last_name) ||
    bad(body.username) ||
    first_name.length > 100 ||
    last_name.length > 100 ||
    usernameError
  ) {
    return NextResponse.json({ error: "Profile contains invalid text" }, { status: 400 });
  }

  if (first_name.length > 100 || last_name.length > 100 || username.length > 100) {
    return NextResponse.json({ error: "Fields must be 100 characters or fewer" }, { status: 400 });
  }

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