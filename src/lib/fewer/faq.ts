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
 *
 * The set was rewritten (T-254) around what a reader who just landed on the
 * page has not been told yet. Every question below is one the page answers
 * badly or not at all: the privacy band and the hero's trust line already
 * cover "does fewer send my data anywhere", and the "Launch the app" button
 * already covers "do I have to install it". What was left was the money
 * question, the watermark surprise, the comparison nobody makes for them,
 * the write-access question, the scale question, the search-scope question
 * and the "do I have to start over" question.
 */
export const FALLBACK_FAQ: FaqItem[] = [
  {
    slug: "is-it-free",
    question: "Is fewer free?",
    answer:
      "The core is free and needs no account: open a folder, an archive, a link or a repo, search it, arrange it and export it. A free account adds saved graphs, version history and share links. A few power features are Pro: the panel workspace, tags, exports without the fewer credit and watch digests. There is no checkout yet, so Pro is set up by hand. The [pricing page](/pricing) has the numbers.",
  },
  {
    slug: "export-watermark",
    question: "Why does my export carry a fewer watermark?",
    answer:
      "Below the Pro plan every export carries a small fewer credit: a linked logo on PNG and SVG, a credit line on the other formats. Pro removes it, and the toggle in the export panel turns it off.",
  },
  {
    slug: "different-from-file-manager",
    question: "How is this different from my file manager?",
    answer:
      "A file manager opens one folder at a time and shows you a list. Fewer puts the whole tree on one canvas: search everything inside it, even files still zipped up, group and rename in bulk, re-lay it out, and export the result.",
  },
  {
    slug: "edit-directory",
    question: "Can fewer make changes to my directory?",
    answer:
      "Not directly. Fewer does not write to the folders on your system: it reads a directory, lets you organise it on the canvas and export the result, and every change stays inside the graph until you export. Writing back to the real directory is not available in the browser build. The desktop version, which is work in progress, is where that will live.",
  },
  {
    slug: "how-big",
    question: "How big a folder can it handle?",
    answer:
      "fewer is built for trees in the thousands of cards: zoom out and every folder folds to a one-line pill, large folders hide their rows, and the layout is written for 1K+ cards. A folder with hundreds of thousands of files is a different job.",
  },
  {
    slug: "search-scope",
    question: "Does it search inside my files?",
    answer:
      "It searches names and paths, including files inside zip, tar and other archives that were never unpacked. It does not read the text inside your files: nothing is uploaded and nothing is indexed on our side.",
  },
  {
    slug: "re-import",
    question: "Do I have to import my folder again?",
    answer:
      "Yes, unless you save it. The canvas lives in the tab, so closing it loses the view. Save the graph to a free account to reopen it anywhere, or export it as JSON and import it back.",
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
