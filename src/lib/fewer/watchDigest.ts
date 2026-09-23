import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { crawlTree, MAX_DEPTH, MAX_PAGES } from "./crawl";
import { diffTrees } from "./treeDiff";
import type { TreeEntry } from "./types";
import { emailShell, escapeHtml } from "./emailTemplate";

/**
 * Watch-digest job — crawls every active watched index, diffs against the
 * stored baseline, and emails each user one consolidated digest.
 *
 * Triggered nightly by the GitHub Actions workflow (.github/workflows/
 * watch-digest.yml) via scripts/watch-digest.ts. Also callable through the
 * cron-secret-protected /api/watch/run route for manual/debug triggers.
 * (Moved off Netlify scheduled functions: their free-tier 10s function
 * timeout can't fit a multi-index crawl; Actions jobs get minutes.)
 */
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "fewer <onboarding@resend.dev>";
const MAX_ITEMS_PER_INDEX = 100;

interface WatchedRow {
  id: string;
  user_id: string;
  url: string;
  active: boolean;
  last_tree: TreeEntry | null;
}

interface IndexChange {
  url: string;
  added: string[];
  removed: string[];
}

/**
 * Service-role client. Bypasses RLS so the nightly job can read every user's
 * watchlist. Only used by the cron-secret-protected job entry points.
 */
function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Map user id → email for the digest recipients. Emails are best-effort;
 *  users without a resolvable email are skipped. */
async function buildEmailMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const emailById = new Map<string, string>();
  try {
    const { data: users } = await supabase.auth.admin.listUsers();
    for (const u of users?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  } catch {
    // best-effort
  }
  return emailById;
}

/** Crawl every watched row, diff against its baseline, update the baseline,
 *  and group the non-empty changes per user. */
async function collectChangesByUser(
  supabase: SupabaseClient,
  rows: WatchedRow[],
): Promise<Map<string, IndexChange[]>> {
  const changesByUser = new Map<string, IndexChange[]>();

  for (const row of rows) {
    const { tree } = await crawlTree(row.url, MAX_DEPTH, MAX_PAGES);
    const diff = diffTrees(row.last_tree, tree);

    // Update baseline regardless of whether anything changed.
    await supabase
      .from("watched_indexes")
      .update({ last_tree: tree, last_crawled_at: new Date().toISOString() })
      .eq("id", row.id);

    if (diff.added.length === 0 && diff.removed.length === 0) continue;

    const list = changesByUser.get(row.user_id) ?? [];
    list.push({ url: row.url, added: diff.added, removed: diff.removed });
    changesByUser.set(row.user_id, list);
  }

  return changesByUser;
}

/**
 * Run the nightly digest job. Crawls every active watched index, updates each
 * baseline, and emails one consolidated digest per user with changes. Skips
 * users with no changes. Returns summary counts for logging.
 */
export async function runWatchDigest(): Promise<{ users: number; emails: number }> {
  const supabase = getServiceClient();

  const { data: rows, error: rowsError } = await supabase
    .from("watched_indexes")
    .select("id, user_id, url, active, last_tree")
    .eq("active", true);

  if (rowsError) throw new Error(rowsError.message);
  if (!rows || rows.length === 0) {
    return { users: 0, emails: 0 };
  }

  const emailById = await buildEmailMap(supabase);
  const changesByUser = await collectChangesByUser(supabase, rows as WatchedRow[]);

  // Send one consolidated email per user with changes.
  let emailsSent = 0;
  for (const [userId, changes] of changesByUser) {
    const email = emailById.get(userId);
    if (!email) continue;
    const ok = await sendDigest(email, changes);
    if (ok) emailsSent++;
  }

  return { users: changesByUser.size, emails: emailsSent };
}

/** Totals shown in the digest header/subject. */
function digestCounts(changes: IndexChange[]): { totalAdded: number; totalRemoved: number } {
  return {
    totalAdded: changes.reduce((n, c) => n + c.added.length, 0),
    totalRemoved: changes.reduce((n, c) => n + c.removed.length, 0),
  };
}

/** HTML body of the consolidated digest email (pure). */
export function digestHtml(changes: IndexChange[]): string {
  const { totalAdded, totalRemoved } = digestCounts(changes);

  const sections = changes
    .map((c) => {
      const added = c.added.slice(0, MAX_ITEMS_PER_INDEX);
      const removed = c.removed.slice(0, MAX_ITEMS_PER_INDEX);
      const addedMore = c.added.length - added.length;
      const removedMore = c.removed.length - removed.length;
      const rows = [
        ...added.map((p) => `<li style="color:#51cf66;">+ ${escapeHtml(p)}</li>`),
        ...removed.map((p) => `<li style="color:#ff6b6b;">− ${escapeHtml(p)}</li>`),
      ];
      if (addedMore > 0) rows.push(`<li style="color:#868e96;">… and ${addedMore} more added</li>`);
      if (removedMore > 0) rows.push(`<li style="color:#868e96;">… and ${removedMore} more removed</li>`);
      return `
        <div style="margin:0 0 24px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#f8f9fa;word-break:break-all;">${escapeHtml(c.url)}</p>
          <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
            ${rows.join("")}
          </ul>
        </div>`;
    })
    .join("");

  const intro = `<strong style="color:#f8f9fa;">${totalAdded}</strong> added · <strong style="color:#f8f9fa;">${totalRemoved}</strong> removed across ${changes.length} watched index${changes.length === 1 ? "" : "es"}.`;

  return emailShell({
    preheader: intro,
    heading: "Daily directory changes",
    intro,
    body: sections,
    footnote: "You watch these indexes — manage them in Settings → Watched.",
  });
}

/** Plain-text body of the consolidated digest email (pure). */
export function digestText(changes: IndexChange[]): string {
  const { totalAdded, totalRemoved } = digestCounts(changes);
  return `Daily directory changes\n\n${totalAdded} added · ${totalRemoved} removed across ${changes.length} watched index${changes.length === 1 ? "" : "es"}.\n\n${changes
    .map((c) => `${c.url}\n${[...c.added.map((p) => `+ ${p}`), ...c.removed.map((p) => `- ${p}`)].join("\n")}`)
    .join("\n\n")}`;
}

/** Build and send a single consolidated digest email. Returns true on success. */
async function sendDigest(email: string, changes: IndexChange[]): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping digest email");
    return false;
  }
  const resend = new Resend(resendKey);
  const { totalAdded, totalRemoved } = digestCounts(changes);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: `fewer digest: ${totalAdded} added, ${totalRemoved} removed`,
      html: digestHtml(changes),
      text: digestText(changes),
    });
    return true;
  } catch (err) {
    console.warn(`Failed to email digest to ${email}:`, err instanceof Error ? err.message : err);
    return false;
  }
}