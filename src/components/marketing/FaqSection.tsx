import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { renderInline } from "@/lib/MarkdownRenderer";
import { APP_URL } from "./MarketingLayout";
import { Reveal } from "./Reveal";
import { faqJsonLd, type FaqItem } from "@/lib/fewer/faq";

/**
 * FAQ (T-254): the questions the landing page answers, in the copy the
 * database holds (see src/lib/fewer/faq.ts and the faq_items migration).
 *
 * Shape: the same rhythm as the closing chapter it joins - a centred heading
 * and a lead-in over one centred column, with the rows left-aligned inside
 * it - so the page still reads as one continuous piece after the open source
 * band. The rows wear the privacy tiles' chrome (one border, one background,
 * one hover), so a question looks like a card rather than a table row.
 *
 * The disclosure is a native <details>: it opens without JavaScript, works
 * from the keyboard for free, and keeps the answer in the HTML for a crawler
 * (which is also what the FAQPage payload below describes). Radix's accordion
 * is installed but needs a client component and hydration to open - the page
 * has a standing rule that it must never depend on JavaScript to be read, and
 * a native disclosure honours it.
 *
 * Nothing here is withheld: the answer is in the DOM from the start, only the
 * open state is the reader's to toggle. Several rows can be open at once -
 * there is no state to keep, and a reader comparing two answers is not
 * fighting the page.
 */
export function FaqSection({ items }: { items: FaqItem[] }) {
  // No rows means the section is not part of the page: the database was read
  // successfully and holds nothing published, which is the operator's call.
  if (items.length === 0) return null;

  return (
    <section
      id="faq"
      className="relative z-10 scroll-mt-[var(--mk-header-h)] py-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
            The things people ask first, answered here.
          </p>
        </Reveal>

        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {items.map((item, index) => (
            <Reveal key={item.slug} delay={Math.min(index * 40, 240)}>
              <details
                data-mk-faq={item.slug}
                className="group rounded-xl border border-border/60 bg-card/50 px-6 py-5 transition-colors hover:border-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-base leading-relaxed text-foreground/90">
                  {renderInline(item.answer)}
                </p>
              </details>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-10 flex justify-center">
            <Link href={APP_URL} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Launch the app
            </Link>
          </div>
        </Reveal>
      </div>

      {/* The structured data a search engine reads for a FAQ result. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd(items) }}
      />
    </section>
  );
}
