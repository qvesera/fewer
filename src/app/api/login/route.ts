import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * POST /api/login
 * Password sign-in that accepts an EMAIL *or* a USERNAME as the identifier.
 *
 * Supabase auth only accepts an email/phone for password login, so a username
 * is resolved to its account's email here using the service role (a not-yet
 * signed-in caller can't read the owner-only `profiles` table). The credential
 * check then runs normally against the resolved email and, on success, the
 * session cookie is set (middleware keeps it alive).
 *
 * Every failure returns the same generic message so the endpoint can't be used
 * to enumerate which usernames/emails exist.
 */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Auth is not configured on this server" }, { status: 500 });
  }

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (
    typeof body.identifier !== "string" ||
    typeof body.password !== "string" ||
    body.password.length === 0
  ) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 400 });
  }

  // Emails pass straight through (lowercased, as auth matches case-insensitively);
  // anything without an "@" is treated as a username and resolved to its email.
  let email = body.identifier.trim().toLowerCase();
  const isEmail = email.includes("@");

  if (!isEmail) {
    const service = getServiceClient();
    if (!service) {
      return NextResponse.json(
        { error: "Cannot resolve usernames on this server" },
        { status: 500 },
      );
    }
    const { data: profile } = await service
      .from("profiles")
      .select("user_id")
      .eq("username", email)
      .maybeSingle();
    if (!profile?.user_id) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    const { data: user } = await service.auth.admin.getUserById(profile.user_id);
    email = user?.user?.email ?? "";
    if (!email) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
  }

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

  const { error } = await supabase.auth.signInWithPassword({ email, password: body.password });
  if (error) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}