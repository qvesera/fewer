/**
 * Canonical HTML email shell — one layout for every email the app sends
 * (Resend digest/invite + Supabase auth templates). Paste the generated
 * HTML into Dashboard → Auth → Email Templates after running
 * `bun run email:templates`.
 *
 * Dark by default; `@media (prefers-color-scheme: light)` overrides for
 * clients that support it (Apple Mail, Gmail app, Yahoo, Outlook.com).
 * Outlook desktop ignores <style> — stays dark (fine).
 * Table-based layout for Outlook; all-inline styles for Gmail.
 */

/**
 * Base64-encoded logo-192.png — the square app icon, embedded directly so emails work without
 * any external image host. Eliminates broken images in local dev, email
 * clients that block remote images, and Supabase dashboard previews.
 * Regenerate: `node -e "console.log('data:image/png;base64,' + require('fs').readFileSync('public/logo-192.png').toString('base64'))"`.
 */
export const LOGO_DATA_URI = "data:image/png;base64,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";

/** Brand tokens — dark theme (default). Single source; update once, all emails follow. */
export const EMAIL_BRAND = {
  pageBg: "#0b0b13",
  cardBg: "#050510",
  borderColor: "#1f1f2b",
  borderRadius: "12px",
  maxWidth: "520px",
  padding: "32px",
  headingColor: "#ffffff",
  bodyColor: "#cbd5e1",
  accentBg: "#f97316",
  accentText: "#0b0b13",
  footnoteColor: "#94a3b8",
  footnoteBorderColor: "#1f1f2b",
  footerColor: "#64748b",
  font: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

/** Light-theme overrides — applied via @media (prefers-color-scheme: light). */
const LIGHT = {
  pageBg: "#ffffff",
  cardBg: "#f8f9fa",
  borderColor: "#e2e8f0",
  headingColor: "#0f172a",
  bodyColor: "#475569",
  footnoteColor: "#64748b",
  footnoteBorderColor: "#e2e8f0",
  footerColor: "#94a3b8",
} as const;

/** ponytail: <style> block with !important beats inline styles in clients that support both.
 *  Dark-mode inline styles are the fallback for Outlook desktop and any client that
 *  ignores <style> or prefers-color-scheme. */
const THEME_CSS = `
@media (prefers-color-scheme:light){
  .em-body{background-color:${LIGHT.pageBg}!important}
  .em-card{background-color:${LIGHT.cardBg}!important;border-color:${LIGHT.borderColor}!important}
  .em-heading{color:${LIGHT.headingColor}!important}
  .em-text{color:${LIGHT.bodyColor}!important}
  .em-footnote{color:${LIGHT.footnoteColor}!important;border-color:${LIGHT.footnoteBorderColor}!important}
  .em-footer{color:${LIGHT.footerColor}!important}
  .em-footer-border{border-color:${LIGHT.borderColor}!important}
}`;

/**
 * Render a complete HTML email.
 *
 * `body` is raw HTML — pre-escaped by the caller (lists, paragraphs, etc).
 * All other strings are escaped automatically.
 */
export function emailShell(opts: {
  preheader: string;
  heading: string;
  intro: string;
  body: string;
  cta?: { text: string; href: string };
  footnote?: string;
  logoHref?: string;
}): string {
  const esc = escapeHtml;
  const b = EMAIL_BRAND;
  const logoUrl = opts.logoHref ?? opts.cta?.href ?? "https://app.fewer.directory";

  const logoHtml = `<a href="${esc(logoUrl)}" style="display:inline-block;margin-bottom:24px;text-decoration:none;"><img src="${LOGO_DATA_URI}" alt="" width="40" height="40" style="display:inline-block;vertical-align:middle;border:0;"><span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:20px;font-weight:700;letter-spacing:-0.5px;color:${b.headingColor};">fewer<span style="color:${b.accentBg};">.directory</span></span></a>`;

  const ctaHtml = opts.cta
    ? `<p style="margin:24px 0 0;"><a href="${esc(opts.cta.href)}" style="display:inline-block;background:${b.accentBg};color:${b.accentText};font-weight:600;font-size:15px;text-decoration:none;padding:12px 24px;border-radius:8px;">${esc(opts.cta.text)}</a></p>`
    : "";

  const footnoteHtml = opts.footnote
    ? `<p class="em-footnote" style="margin:24px 0 0;font-size:13px;color:${b.footnoteColor};border-top:1px solid ${b.footnoteBorderColor};padding-top:24px;word-break:break-all;">${esc(opts.footnote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>fewer</title>
  <style>${THEME_CSS}</style>
</head>
<body class="em-body" style="margin:0;padding:0;background:${b.pageBg};font-family:${b.font};color:${b.headingColor};">
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(opts.preheader)}</span>
  <div style="padding:40px 16px;background:${b.pageBg};">
    <table class="em-card" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;max-width:${b.maxWidth};width:100%;background:${b.cardBg};border:1px solid ${b.borderColor};border-radius:${b.borderRadius};">
      <tr>
        <td style="padding:${b.padding};">
          ${logoHtml}
          <h1 class="em-heading" style="margin:0 0 16px;font-size:22px;font-weight:700;color:${b.headingColor};">${esc(opts.heading)}</h1>
          <p class="em-text" style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${b.bodyColor};">${esc(opts.intro)}</p>
          ${opts.body}
          ${ctaHtml}
          ${footnoteHtml}
        </td>
      </tr>
      <tr>
        <td class="em-footer-border" style="padding:16px ${b.padding};text-align:center;border-top:1px solid ${b.borderColor};">
          <span class="em-footer" style="font-size:12px;color:${b.footerColor};">&copy; fewer &middot; Interactive File &amp; System Graph Visualizer &middot; All rights reserved.</span>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/** Minimal HTML-escape for user-supplied strings injected into the shell. */
export function escapeHtml(s: string): string {
  const amp = String.fromCharCode(38) + "amp;";
  const lt = String.fromCharCode(38) + "lt;";
  const gt = String.fromCharCode(38) + "gt;";
  const quot = String.fromCharCode(38) + "quot;";
  const apos = String.fromCharCode(38) + "apos;";
  return s
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, apos);
}