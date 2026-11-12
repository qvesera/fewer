import { isDangerousText } from "./textValidation";

/**
 * The pricing page's contact form (T-257).
 *
 * The form is the only door: no email address is printed on the page, so
 * there is nothing for a scraper to take, and the reply goes to the visitor
 * because the server sets `replyTo` (a `mailto:` link cannot).
 *
 * Everything here is pure so it can be tested without a server: the route
 * does the sending, this module decides what is allowed and what the mail
 * looks like.
 */

export type ContactPlan = "pro" | "enterprise";

export interface ContactInput {
  plan?: string;
  name?: string;
  email?: string;
  organisation?: string;
  message?: string;
  /** Honeypot: a hidden field only a robot fills in. */
  website?: string;
}

export interface ContactValues {
  plan: ContactPlan;
  name: string;
  email: string;
  organisation: string;
  message: string;
}

export const CONTACT_TO = "enquiry@fewer.directory";

export const CONTACT_PLANS: ContactPlan[] = ["pro", "enterprise"];

const NAME_MAX = 100;
const ORG_MAX = 140;
const MESSAGE_MAX = 2000;
const MESSAGE_MIN = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A single line: anything else could break out of a mail header. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Validate and clean the form. Returns the cleaned values, or the first
 * problem as a message the form can show under the field.
 */
export function validateContact(input: ContactInput): {
  ok: true;
  value: ContactValues;
} | {
  ok: false;
  error: string;
} {
  const plan = (input.plan ?? "") as ContactPlan;
  if (!CONTACT_PLANS.includes(plan)) {
    return { ok: false, error: "Pick what you are asking about." };
  }

  const name = oneLine(input.name ?? "");
  if (name.length < 2 || name.length > NAME_MAX) {
    return { ok: false, error: "Tell us your name (up to 100 characters)." };
  }
  if (isDangerousText(name)) {
    return { ok: false, error: "That name contains characters we cannot use." };
  }

  const email = oneLine(input.email ?? "").toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "That email address does not look right." };
  }

  const organisation = oneLine(input.organisation ?? "");
  if (organisation.length > ORG_MAX) {
    return { ok: false, error: "That organisation name is too long." };
  }
  if (organisation && isDangerousText(organisation)) {
    return { ok: false, error: "That organisation name contains characters we cannot use." };
  }

  const message = (input.message ?? "").trim();
  if (message.length < MESSAGE_MIN) {
    return { ok: false, error: "Tell us a little more (at least 10 characters)." };
  }
  if (message.length > MESSAGE_MAX) {
    return { ok: false, error: `Keep it under ${MESSAGE_MAX} characters.` };
  }
  if (isDangerousText(message)) {
    return { ok: false, error: "That message contains characters we cannot use." };
  }

  return { ok: true, value: { plan, name, email, organisation, message } };
}

/**
 * The subject line. The bracket tag is the filter: one label for Pro, one
 * for Enterprise, so both can be sorted in the inbox without reading.
 */
export function contactSubject(plan: ContactPlan, name: string): string {
  const tag = plan === "enterprise" ? "Enterprise enquiry" : "Pro plan";
  return `[${tag}] fewer contact: ${oneLine(name)}`;
}

/** The plain-text body of the enquiry. */
export function contactText(value: ContactValues): string {
  return [
    `Plan: ${value.plan === "enterprise" ? "Enterprise" : "Pro"}`,
    `Name: ${value.name}`,
    `Email: ${value.email}`,
    value.organisation ? `Organisation: ${value.organisation}` : "",
    "",
    value.message,
    "",
    "--",
    "Sent from the pricing page on fewer.directory.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
