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
 * Base64-encoded logo_flat.png — embedded directly so emails work without
 * any external image host. Eliminates broken images in local dev, email
 * clients that block remote images, and Supabase dashboard previews.
 * Regenerate: `node -e "console.log('data:image/png;base64,' + require('fs').readFileSync('public/logo_flat.png').toString('base64'))"`.
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