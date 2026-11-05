/**
 * Plan-change email job — emails the account owner whenever profiles.plan
 * moves (free/pro/team), whoever moved it.
 *
 * The outbox is written by the DB trigger in 0057_plan_change_events.sql, so
 * both writers are covered: the Stripe billing webhook and operator SQL in
 * Supabase Studio (the documented path while BILLING_ENABLED is off).
 *
 * Two entry points share this code:
 *   - POST /api/plan/notify (instant, x-cron-secret) with one row id, from a
 *     Supabase Database Webhook on plan_change_events INSERT;
 *   - scripts/plan-change-notify.ts (safety net), run every 15 min by
 *     .github/workflows/plan-change-notify.yml.
 *
 * A row is claimed before it is sent, so the two can overlap without
 * double-mailing. ponytail: claim-then-send loses one mail if the process
 * dies between the claim and Resend — fail-closed (never a duplicate), and
 * the sweep reclaims only after CLAIM_TAKEOVER_MS has passed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { emailShell, escapeHtml } from "./emailTemplate";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "fewer <onboarding@resend.dev>";
const MAX_ATTEMPTS = 3;
const CLAIM_TAKEOVER_MS = 5 * 60_000;
const SWEEP_LIMIT = 50;

export interface PlanChangeRow {
  id: number;
  email: string | null;
  from_plan: string | null;
  to_plan: string;
  attempts?: number;
}

/** Display label for a stored plan value (enum → title case). */
export function planLabel(plan: string | null | undefined): string {
  const s = String(plan ?? "");
  if (s === "free") return "Free";
  if (s === "pro") return "Pro";
  if (s === "team") return "Team";
  return s;
}

/** Subject line — same wording for upgrades and downgrades. */
export function planChangeSubject(row: PlanChangeRow): string {
  return `Your fewer plan is now ${planLabel(row.to_plan)}`;
}

/** HTML body of the plan-change email (pure). */
export function planChangeEmailHtml(row: PlanChangeRow): string {
  const to = planLabel(row.to_plan);
  const intro = row.from_plan
    ? `Your fewer plan changed from ${planLabel(row.from_plan)} to ${to}.`
    : `Your fewer plan is now ${to}.`;

  const detail =
    `Your account now runs on the ${to} plan. Plan limits apply immediately: ` +
    "review what is included and your current usage in Settings → Account.";

  const body = `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5e1;">${escapeHtml(detail)}</p>`;

  return emailShell({
    preheader: intro,
    heading: "Your plan changed",
    intro,
    body,
    footnote: "This email is sent automatically whenever an account's plan changes.",
  });
}

/** Plain-text body of the plan-change email (pure). */
export function planChangeEmailText(row: PlanChangeRow): string {
  const to = planLabel(row.to_plan);
  const intro = row.from_plan
    ? `Your fewer plan changed from ${planLabel(row.from_plan)} to ${to}.`
    : `Your fewer plan is now ${to}.`;
  return `Your plan changed\n\n${intro}\n\nYour account now runs on the ${to} plan. Plan limits apply immediately: review what is included and your current usage in Settings -> Account.\n`;
}

/**
 * Extract the row id from a Supabase Database Webhook body
 * (`{ type, table, record: { id, ... }, ... }`). Anything else yields null —
 * the payload is never trusted beyond the id, which is re-read from the table.
 */
export function planChangeRecordId(body: unknown): number | null {
  const record = (body as { record?: { id?: unknown } } | null | undefined)?.record;
  const id = record?.id;
  if (typeof id === "number" && Number.isInteger(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return null;
}

/** Service-role client. Bypasses RLS to read every user's outbox row. */
function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Rows eligible to send: unsent, under the attempt cap, and not claimed by a
 *  live run (a stale claim older than the takeover window is reclaimable). */
async function fetchPending(supabase: SupabaseClient, id?: number): Promise<PlanChangeRow[]> {
  const takeover = new Date(Date.now() - CLAIM_TAKEOVER_MS).toISOString();
  let query = supabase
    .from("plan_change_events")
    .select("id, email, from_plan, to_plan, attempts")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`claimed_at.is.null,claimed_at.lt.${takeover}`);
  if (id !== undefined) query = query.eq("id", id);
  const { data, error } = await query.order("id", { ascending: true }).limit(SWEEP_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanChangeRow[];
}

/** Atomically take ownership of one row. Returns null when another runner
 *  already owns it (or it is no longer eligible) — never sends twice. */
async function claim(supabase: SupabaseClient, row: PlanChangeRow): Promise<PlanChangeRow | null> {
  const takeover = new Date(Date.now() - CLAIM_TAKEOVER_MS).toISOString();
  const { data, error } = await supabase
    .from("plan_change_events")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`claimed_at.is.null,claimed_at.lt.${takeover}`)
    .select("id, email, from_plan, to_plan, attempts")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlanChangeRow | null) ?? null;
}

/** Terminal state: emailed, or deliberately skipped (no address on file). */
async function markSent(supabase: SupabaseClient, id: number, lastError: string | null): Promise<void> {
  const { error } = await supabase
    .from("plan_change_events")
    .update({ sent_at: new Date().toISOString(), claimed_at: null, last_error: lastError })
    .eq("id", id);
  if (error) console.warn(`Failed to mark plan change ${id} sent:`, error.message);
}

/** Release the claim and count the attempt, so a broken send stops retrying
 *  after MAX_ATTEMPTS instead of looping forever. */
async function markFailed(supabase: SupabaseClient, row: PlanChangeRow, message: string): Promise<void> {
  const { error } = await supabase
    .from("plan_change_events")
    .update({
      claimed_at: null,
      attempts: (row.attempts ?? 0) + 1,
      last_error: message.slice(0, 500),
    })
    .eq("id", row.id);
  if (error) console.warn(`Failed to record plan change ${row.id} error:`, error.message);
}

/** Send one email. Returns an error message, or null on success. */
async function sendOne(resend: Resend, row: PlanChangeRow & { email: string }): Promise<string | null> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [row.email],
      subject: planChangeSubject(row),
      html: planChangeEmailHtml(row),
      text: planChangeEmailText(row),
    });
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export interface PlanChangeNotifyResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Send the pending plan-change emails. `opts.id` narrows the run to a single
 * row (the instant webhook path); without it this is the cron sweep.
 * Returns counts for logging. Throws on configuration/DB errors so an entry
 * point can report them.
 */
export async function runPlanChangeNotify(
  opts: { id?: number } = {},
): Promise<PlanChangeNotifyResult> {
  const supabase = getServiceClient();
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping plan change emails");
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const candidates = await fetchPending(supabase, opts.id);
  if (candidates.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const resend = new Resend(resendKey);
  const result: PlanChangeNotifyResult = { sent: 0, failed: 0, skipped: 0 };

  for (const row of candidates) {
    const claimed = await claim(supabase, row);
    if (!claimed) {
      result.skipped++;
      continue;
    }
    if (!claimed.email) {
      // No address on file — terminal, not a retry: waiting won't grow one.
      await markSent(supabase, claimed.id, "no email on account");
      result.skipped++;
      continue;
    }
    const sendError = await sendOne(resend, claimed as PlanChangeRow & { email: string });
    if (sendError) {
      await markFailed(supabase, claimed, sendError);
      console.warn(`Failed to email plan change ${claimed.id} to ${claimed.email}:`, sendError);
      result.failed++;
    } else {
      await markSent(supabase, claimed.id, null);
      result.sent++;
    }
  }

  return result;
}
