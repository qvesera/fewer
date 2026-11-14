import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FALLBACK_FAQ, faqJsonLd, type FaqItem } from "./faq";

/**
 * FAQ guards (T-254).
 *
 * The landing page's questions live in the database, and the repo keeps a
 * copy of the same rows as the fallback for a build or an environment with no
 * database. Two copies drift unless something pins them: the seed migration
 * and FALLBACK_FAQ must name the same questions, in the same order, with
 * the same answers. That is what the first test below does.
 *
 * The second test is the security one. The copy is read from the database, so
 * it is data an operator can put anything into, and it is emitted inside an
 * inline <script>: a question carrying `</script>` would close the element
 * and inject markup into the page. JSON.stringify escapes none of that.
 */
const MIGRATIONS = join(import.meta.dir, "../../../supabase/migrations");

/** The rows a `*faq*.sql` migration seeds: (slug, question, answer, order). */
function seededRows(): { slug: string; question: string; answer: string }[] {
  const rows: { slug: string; question: string; answer: string }[] = [];
  const rowPattern =
    /\(\s*'([a-z0-9-]+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*\d+\s*\)/g;

  for (const file of readdirSync(MIGRATIONS).filter((f) => /faq/i.test(f))) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const match of sql.matchAll(rowPattern)) {
      rows.push({
        slug: match[1],
        question: match[2].replace(/''/g, "'"),
        answer: match[3].replace(/''/g, "'"),
      });
    }
  }
  return rows;
}

/** Whitespace-insensitive compare: the SQL wraps, the TS file does not. */
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

describe("FAQ seed and fallback stay in step", () => {
  test("the seeded rows and the fallback are the same questions", () => {
    const seeded = seededRows();
    expect(seeded.length).toBeGreaterThan(0);

    expect(seeded.map((r) => r.slug)).toEqual(FALLBACK_FAQ.map((f) => f.slug));
    for (const [index, row] of seeded.entries()) {
      expect(row.question).toBe(FALLBACK_FAQ[index].question);
      expect(normalize(row.answer)).toBe(normalize(FALLBACK_FAQ[index].answer));
    }
  });

  test("the fallback has unique slugs", () => {
    const slugs = FALLBACK_FAQ.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("faqJsonLd", () => {
  test("describes every question as a FAQPage", () => {
    const payload = JSON.parse(faqJsonLd(FALLBACK_FAQ));
    expect(payload["@context"]).toBe("https://schema.org");
    expect(payload["@type"]).toBe("FAQPage");
    expect(payload.mainEntity).toHaveLength(FALLBACK_FAQ.length);
    expect(payload.mainEntity[0]["@type"]).toBe("Question");
    expect(payload.mainEntity[0].name).toBe(FALLBACK_FAQ[0].question);
    expect(payload.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(payload.mainEntity[0].acceptedAnswer.text).toBe(FALLBACK_FAQ[0].answer);
  });

  test("cannot be broken out of the script tag by the copy", () => {
    const hostile: FaqItem[] = [
      { slug: "x", question: "</script><img src=x onerror=alert(1)>", answer: "a & b" },
    ];
    const json = faqJsonLd(hostile);
    expect(json).not.toContain("</script>");
    expect(json).not.toContain("<img");
    expect(json).toContain("\\u003c");
    // Still the same payload once parsed.
    const payload = JSON.parse(json);
    expect(payload.mainEntity[0].name).toBe("</script><img src=x onerror=alert(1)>");
  });
});
