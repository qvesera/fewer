import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { countOwned, getUserPlan, limitsFor, overLimit } from "@/lib/fewer/plans";

/**
 * Build an authed Supabase client from the session cookie and return it with
 * the current user. Using the authed client (not the anon key) attaches the
 * user's JWT so RLS sees auth.uid() — required for owner-scoped policies.
 */
async function getAuthed() {
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
  return { supabase, user: data.user ?? null };
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * GET /api/watch
 * List the signed-in user's watched indexes.
 */
export async function GET() {
  try {
    const authed = await getAuthed();
    if (!authed?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { supabase, user } = authed;

    const { data, error } = await supabase
      .from("watched_indexes")
      .select("id, url, active, last_crawled_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ watched: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/watch
 * Add a public file index URL to the user's watchlist.
 */
export async function POST(request: Request) {
  try {
    const authed = await getAuthed();
    if (!authed?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { supabase, user } = authed;

    const body = await request.json();
    const rawUrl = body?.url?.trim();
    if (!rawUrl || !isValidHttpUrl(rawUrl)) {
      return NextResponse.json({ error: "Invalid URL. Provide a public file index URL (http/https)." }, { status: 400 });
    }

    // Plan cap, but only for genuinely new watches — re-watching a URL the
    // user already watches is an update (upsert), not a new slot.
    const { data: existing } = await supabase
      .from("watched_indexes")
      .select("id")
      .eq("user_id", user.id)
      .eq("url", rawUrl)
      .maybeSingle();
    if (!existing) {
      const limits = limitsFor(await getUserPlan(supabase, user.id));
      if (
        limits.watchedIndexes !== Infinity &&
        overLimit(await countOwned(supabase, "watched_indexes", user.id), limits.watchedIndexes)
      ) {
        return NextResponse.json(
          {
            error: `Free plan watches up to ${limits.watchedIndexes} indexes. Upgrade to Pro for unlimited watches.`,
            code: "plan_limit",
          },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("watched_indexes")
      .upsert(
        { user_id: user.id, url: rawUrl, active: true },
        { onConflict: "user_id,url" }
      )
      .select("id, url, active, last_crawled_at, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ watched: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/watch?url=<url>
 * Remove a URL from the user's watchlist.
 */
export async function DELETE(request: Request) {
  try {
    const authed = await getAuthed();
    if (!authed?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { supabase, user } = authed;

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    const { error } = await supabase
      .from("watched_indexes")
      .delete()
      .eq("user_id", user.id)
      .eq("url", url);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}