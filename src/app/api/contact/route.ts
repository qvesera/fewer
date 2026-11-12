import { NextResponse } from "next/server";
import { Resend } from "resend";
import { serverError } from "@/lib/fewer/apiHelpers";
import {
  CONTACT_TO,
  contactSubject,
  contactText,
  validateContact,
  type ContactInput,
} from "@/lib/fewer/contactRequest";

/**
 * POST /api/contact
 * The pricing page's contact form (T-257).
 *
 * It sends one mail to the enquiry inbox with the visitor in `replyTo`, so
 * the address never appears in the page and a reply lands in the visitor's
 * inbox. The sender is the app's own verified address, because mail can only
 * be sent as a domain you control: `from` is never the visitor.
 *
 * It is an open endpoint by nature (a marketing page has no signed-in
 * users), so it is fenced: a per-IP rate limit and a honeypot field. The
 * limit is in memory, which is best effort - the reverse proxy is the real
 * limit - and it is deliberately small, because a person sends one enquiry.
 */

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "fewer <onboarding@resend.dev>";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 3;
const rateState = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateState.get(key);
  if (!entry || now >= entry.reset) {
    if (rateState.size > 1000) rateState.clear();
    rateState.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_MAX;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      // A self-hosted deployment without Resend has no way to deliver the
      // enquiry, and saying so is better than a silent no-op.
      return NextResponse.json(
        { error: "The contact form is not configured on this deployment." },
        { status: 503 },
      );
    }

    if (rateLimited(clientIp(request))) {
      return NextResponse.json(
        { error: "Too many enquiries from here. Try again in a few minutes." },
        { status: 429 },
      );
    }

    let body: ContactInput;
    // A plain HTML form post (no JavaScript, or hydration that never
    // happened) sends a form-encoded body; the fetch path sends JSON. Both
    // are answered, and the form-encoded one answers with a redirect, which
    // is what a browser expects from a form submission.
    const contentType = request.headers.get("content-type") ?? "";
    const isFormPost = contentType.includes("application/x-www-form-urlencoded");
    try {
      if (isFormPost) {
        const form = await request.formData();
        body = {
          plan: String(form.get("plan") ?? ""),
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          organisation: String(form.get("organisation") ?? ""),
          message: String(form.get("message") ?? ""),
          website: String(form.get("website") ?? ""),
        };
      } else {
        body = (await request.json()) as ContactInput;
      }
    } catch {
      if (isFormPost) {
        return NextResponse.redirect(new URL("/pricing?sent=0", request.url), 303);
      }
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    // The honeypot: a field a person never sees, so only a robot fills it.
    // Answer as if it worked, so the robot learns nothing.
    if (body.website) {
      return isFormPost
        ? NextResponse.redirect(new URL("/pricing?sent=1", request.url), 303)
        : NextResponse.json({ ok: true });
    }

    const parsed = validateContact(body);
    if (!parsed.ok) {
      if (isFormPost) {
        return NextResponse.redirect(new URL("/pricing?sent=0", request.url), 303);
      }
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { value } = parsed;
    const resend = new Resend(resendKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [CONTACT_TO],
      replyTo: value.email,
      subject: contactSubject(value.plan, value.name),
      text: contactText(value),
    });
    if (error) {
      console.error("[contact] resend failed:", error.message);
      return isFormPost
        ? NextResponse.redirect(new URL("/pricing?sent=0", request.url), 303)
        : NextResponse.json({ error: "Could not send that. Try again." }, { status: 502 });
    }

    return isFormPost
      ? NextResponse.redirect(new URL("/pricing?sent=1", request.url), 303)
      : NextResponse.json({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
