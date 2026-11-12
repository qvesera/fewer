/**
 * Landing page FAQ: the shape of a question, the fallback copy, and the
 * schema.org payload for it (T-254).
 *
 * The DB is the source of truth for the copy - `faq_items` is read by the
 * landing page (src/app/page.tsx) and edited in the Supabase Studio. This
 * module holds no database code on purpose: the fallback list and the
 * structured-data builder are pure, so they can be unit tested without an
 * environment, and the query stays with the page that renders it (the same
 * split the docs and blog listings use).
 *
 * FALLBACK_FAQ is the repo copy of the seeded rows: it is what the page
 * shows when the database cannot be reached (a build without Supabase env
 * vars, a static export, an outage) and what the e2e suite asserts against.
 * faq.test.ts pins it to the migration seed so the two cannot drift.
 */

export type FaqItem = {
  /** Stable key: the primary key in the DB and the anchor id on the page. */
  slug: string;
  question: string;
  /** Plain text. Inline markdown (bold, code, [label](url)) is rendered. */
  answer: string;
};

/**
 * The seeded questions (supabase/migrations/0060_faq_items.sql). Same copy as
 * README §FAQ, which stays the source-of-record backup.
 */
export const FALLBACK_FAQ: FaqItem[] = [
  {
    slug: "privacy",
    question: "Does fewer send my directory data anywhere?",
    answer:
      "Your directory is never uploaded. Local import, editing, layout and export all run in your browser. Network calls happen only for features you opt into: GitHub, URL and Internet Archive imports, linked cloud accounts, an account (saved graphs, version history, share links, gallery), and watch digests. No telemetry, no analytics.",
  },
  {
    slug: "no-install",
    question: "Can I use fewer without installing anything?",
    answer:
      "Yes. The standalone version runs at app.fewer.directory. The self-hosted version needs bun install and bun run dev.",
  },
  {
    slug: "edit-directory",
    question: "Can I make changes to my directory using fewer?",
    answer:
      "Not directly. Fewer does not write to the folders on your system: it reads a directory, lets you organise it on the canvas and export the result, and every change stays inside the graph until you export. Writing back to the real directory is not available in the browser build. The desktop version, which is work in progress, is where that will live.",
  },
  {
    slug: "account",
    question: "Do I need an account?",
    answer:
      "No. Fewer works fully without one. Signing in (optional) unlocks saving graphs to your account, opening them on another device, and invite-only sharing.",
  },
  {
    slug: "avatar",
    question: "Can I set my own avatar?",
    answer:
      "The avatar in the toolbar is your Google or GitHub profile picture when you signed up with one, otherwise your initials. Fewer does not host user images, so there is no upload: that keeps the app free of image storage without giving up identity in the toolbar.",
  },
];

/**
 * JSON-LD characters that must not survive into an inline <script>: `<` and
 * `>` end the element, `&` and the line separators break parsers that treat
 * the payload as HTML. JSON.stringify escapes none of them.
 */
const UNSAFE_IN_SCRIPT = /[<>&\u2028\u2029]/g;

function escapeForScript(value: string): string {
  return value.replace(UNSAFE_IN_SCRIPT, (char) => {
    return `\\u${char.codePointAt(0)!.toString(16).padStart(4, "0")}`;
  });
}

/**
 * The FAQPage payload Google reads for a rich FAQ result. The answer text is
 * the plain string: an answer may carry inline markdown for the page, and
 * that markup would only be noise in the structured data.
 *
 * The whole payload is escaped for an inline <script> - the copy comes from
 * the database, so a `</script>` inside a question would otherwise close the
 * element and inject markup into the page.
 */
export function faqJsonLd(items: FaqItem[]): string {
  const payload = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return escapeForScript(JSON.stringify(payload));
}
