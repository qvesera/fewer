import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { scheduledDeletionIso } from "@/lib/fewer/accountDeletion";

/**
 * DELETE /api/account
 * Schedules the signed-in user's account for deletion.
 *
 * How it works:
 *  1. Resolve the user from the session cookie (403 if signed out).
 *  2. Using the service-role client (bypasses RLS), stamp a
 *     `scheduled_deletion` timestamp (now + 7 days) into the user's
 *     `app_metadata`. Nothing is deleted yet — see
 *     src/lib/fewer/accountDeletion.ts for the purge semantics.
 *  3. The nightly purge job deletes the user's data when the window lapses;
 *     signing in again before that clears the marker (recovery path).
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
    // Schedule the deletion; the nightly purge job does the actual cleanup.
    const { error } = await service.auth.admin.updateUserById(user.id, {
      app_metadata: { scheduled_deletion: scheduledDeletionIso() },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not delete account";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}