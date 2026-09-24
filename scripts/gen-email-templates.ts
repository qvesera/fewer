/**
 * Generate Supabase auth email templates from the shared email shell.
 *
 * Run: bun run email:templates
 *
 * Outputs 6 HTML files to supabase/templates/ for local dev
 * and for pasting into Dashboard → Auth → Email Templates.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { emailShell } from "../src/lib/fewer/emailTemplate";

const root = join(import.meta.dir, "..");
const dir = join(root, "supabase/templates");
mkdirSync(dir, { recursive: true });

const templates: Array<{
  name: string;
  subject: string;
  heading: string;
  intro: string;
  body: string;
  cta?: { text: string; href: string };
  footnote: string;
}> = [
  {
    name: "confirmation",
    subject: "Confirm your email address",
    heading: "Confirm your email",
    intro: "Thanks for joining fewer. Please verify your email address to get started.",
    body: "",
    cta: { text: "Confirm Email Address", href: "{{ .ConfirmationURL }}" },
    footnote: 'Button not working? Copy and paste this link:\n{{ .ConfirmationURL }}',
  },
  {
    name: "recovery",
    subject: "Reset your password",
    heading: "Reset your password",
    intro: "Click the button below to choose a new password. If you didn't request this, you can safely ignore this email.",
    body: "",
    cta: { text: "Choose a new password", href: "{{ .ConfirmationURL }}" },
    footnote: 'Button not working? Copy and paste this link:\n{{ .ConfirmationURL }}',
  },
  {
    name: "magic_link",
    subject: "Your sign-in link",
    heading: "Sign in to fewer",
    intro: "Click the button below to sign in. If you didn't request this, you can safely ignore this email.",
    body: "",
    cta: { text: "Sign in to fewer", href: "{{ .ConfirmationURL }}" },
    footnote: 'Button not working? Copy and paste this link:\n{{ .ConfirmationURL }}',
  },
  {
    name: "email_change",
    subject: "Confirm your new email address",
    heading: "Confirm your new email",
    intro: "Please confirm your new email address by clicking the button below.",
    body: "",
    cta: { text: "Confirm new email", href: "{{ .ConfirmationURL }}" },
    footnote: 'Button not working? Copy and paste this link:\n{{ .ConfirmationURL }}',
  },
  {
    name: "invite",
    subject: "You've been invited",
    heading: "You've been invited to join fewer",
    intro: "Click the button below to accept the invitation and create your account.",
    body: "",
    cta: { text: "Accept the invite", href: "{{ .ConfirmationURL }}" },
    footnote: 'Button not working? Copy and paste this link:\n{{ .ConfirmationURL }}',
  },
  {
    name: "reauthentication",
    subject: "Your verification code",
    heading: "Verify your identity",
    intro: "Use the verification code below to continue.",
    body: '<p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#ffffff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.1em;">{{ .Token }}</p>',
    cta: undefined,
    footnote: "This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.",
  },
];

for (const t of templates) {
  const html = emailShell({
    preheader: t.heading,
    heading: t.heading,
    intro: t.intro,
    body: t.body,
    cta: t.cta,
    footnote: t.footnote,
    logoHref: "{{ .SiteURL }}",
  });
  writeFileSync(join(dir, `${t.name}.html`), html);
}

console.log(`Generated ${templates.length} templates in ${dir}`);
