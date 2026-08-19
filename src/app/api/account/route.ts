import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * DELETE /api/account
 * Permanently deletes the signed-in user's account and all related data.
 *
 * How it works:
 *  1. Resolve the user from the session cookie (403 if signed out).
 *  2. Using the service-role client (bypasses RLS), delete the user's owned
 *     `shared_graphs` rows. `share_invites` rows cascade on `shared_graphs`.
 *     (`shared_graphs.owner_id` has no FK, so they would otherwise orphan.)
 *  3. Delete the auth user itself. `saved_graphs`, `watched_indexes`, and
 *     `cloud_connections` all reference `auth.users` with `on delete cascade`,
 *     so those are removed automatically.
 *
 * Returns 204 on success. The client signs the user out afterwards.
 */
async function getAuthedUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
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
  return data.user;
}

/** Service-role client — bypasses RLS so we can clean shared data and delete the user. */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE() {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let service;
  try {
    service = getServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Account deletion is not configured on this server" },
      { status: 500 },
    );
  }

  try {
    // 1. Clean up owned shared graphs (cascades to share_invites).
    const { error: shareError } = await service
      .from("shared_graphs")
      .delete()
      .eq("owner_id", user.id);
    if (shareError) {
      return NextResponse.json({ error: shareError.message }, { status: 500 });
    }

    // 2. Delete the auth user (cascades saved_graphs, watched_indexes, cloud_connections).
    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not delete account";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}