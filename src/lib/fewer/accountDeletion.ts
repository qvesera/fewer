/**
 * Deferred account deletion.
 *
 * DELETE /api/account does not purge immediately: it stamps a
 * `scheduled_deletion` timestamp into the user's `app_metadata` (server-only,
 * not writable through any user-facing API, so it cannot be tampered with).
 * The nightly purge job (scripts/purge-deleted-accounts.ts, run by
 * .github/workflows/purge-deleted-accounts.yml) then, for every user carrying
 * a marker:
 *
 *  - "recover": clears the marker when the user signed in after scheduling —
 *    this is the recovery path and works for every sign-in method, because it
 *    only looks at `last_sign_in_at`;
 *  - "purge": once the grace window has passed, deletes the user's owned
 *    `shared_graphs` rows (share_invites cascade; owner_id has no FK so they
 *    would otherwise orphan) and then the auth user itself — `saved_graphs`,
 *    `watched_indexes`, `cloud_connections`, and `graph_versions` all cascade.
 *  - "wait": grace window still running, user has not signed in again.
 */

import { createClient } from "@supabase/supabase-js";

/** Grace window between the deletion request and the permanent purge. */
export const DELETION_GRACE_DAYS = 7;

/** ISO timestamp `days` from now — the value stamped into `app_metadata`. */
export function scheduledDeletionIso(days: number = DELETION_GRACE_DAYS): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export type DeletionAction = "recover" | "purge" | "wait";

/**
 * Pure decision used by the purge job (unit-tested).
 * @param scheduledIso  the `scheduled_deletion` timestamp
 * @param lastSignInIso the user's `last_sign_in_at`, or null if never signed in
 * @param nowIso        current time (injectable for tests)
 */
export function classifyDeletion(
  scheduledIso: string,
  lastSignInIso: string | null,
  nowIso: string,
): DeletionAction {
  const scheduled = new Date(scheduledIso);
  if (Number.isNaN(scheduled.getTime())) return "wait";
  if (lastSignInIso) {
    const lastSignIn = new Date(lastSignInIso);
    if (!Number.isNaN(lastSignIn.getTime()) && lastSignIn > scheduled) return "recover";
  }
  return new Date(nowIso) >= scheduled ? "purge" : "wait";
}

export interface PurgeResult {
  recovered: number;
  purged: number;
  errors: string[];
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Collects every auth user carrying a `scheduled_deletion` marker (all pages). */
async function usersScheduledForDeletion(service: ReturnType<typeof getServiceClient>) {
  const marked: { id: string; scheduledIso: string; lastSignInIso: string | null }[] = [];
  // ponytail: page size 200 — GoTrue's max; fine until the marked-set is huge,
  // upgrade path is a SQL view on auth.users instead of the admin API.
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      const scheduledIso = u.app_metadata?.scheduled_deletion;
      if (typeof scheduledIso === "string") {
        marked.push({ id: u.id, scheduledIso, lastSignInIso: u.last_sign_in_at ?? null });
      }
    }
    if (data.users.length < 200) break;
  }
  return marked;
}

/** Runs one purge pass. Throws only when listing fails; per-user errors are collected. */
export async function purgeDueAccounts(nowIso: string = new Date().toISOString()): Promise<PurgeResult> {
  const service = getServiceClient();
  const marked = await usersScheduledForDeletion(service);
  const result: PurgeResult = { recovered: 0, purged: 0, errors: [] };

  for (const entry of marked) {
    const action = classifyDeletion(entry.scheduledIso, entry.lastSignInIso, nowIso);
    try {
      if (action === "recover") {
        const { error } = await service.auth.admin.updateUserById(entry.id, {
          app_metadata: { scheduled_deletion: null },
        });
        if (error) throw new Error(error.message);
        result.recovered++;
      } else if (action === "purge") {
        // 1. Owned shared graphs (cascades to share_invites).
        const { error: shareError } = await service
          .from("shared_graphs")
          .delete()
          .eq("owner_id", entry.id);
        if (shareError) throw new Error(shareError.message);
        // 2. The auth user — everything else cascades.
        const { error: deleteError } = await service.auth.admin.deleteUser(entry.id);
        if (deleteError) throw new Error(deleteError.message);
        result.purged++;
      }
    } catch (err) {
      result.errors.push(`${entry.id} (${action}): ${err instanceof Error ? err.message : err}`);
    }
  }

  return result;
}