"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  CURRENCIES,
  CHECKOUT_NOTE,
  INTRO_TERM,
  PRICING_PLANS,
  TAX_NOTE,
  compareAtPrice,
  currencyForLocale,
  formatMoney,
  monthlyEquivalent,
  priceFor,
  type Currency,
  type Period,
} from "@/lib/fewer/pricing";

/**
 * The pricing page's cards and its two switches (T-257).
 *
 * The currency and the period live in the URL (?currency=gbp&period=yearly),
 * the way the gallery's tab does, so a link shows the same price to everyone
 * who opens it. Without JavaScript the page still renders one honest set of
 * prices (USD, monthly): the server renders those, and the switcher only
 * refines them once the page is live.
 *
 * There is no checkout here, so no card may promise one: the prices are
 * display prices, and the way to buy is the form at the bottom.
 */
export function PricingCards() {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [period, setPeriod] = useState<Period>("monthly");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("currency")?.toUpperCase();
    const currencyParam = CURRENCIES.find((c) => c === wanted);
    const periodParam = params.get("period");
    setCurrency(
      currencyParam ?? (params.has("currency") ? "USD" : currencyForLocale(navigator.language)),
    );
    setPeriod(periodParam === "yearly" ? "yearly" : "monthly");
  }, []);

  /** Keep the URL in step, without a router: the gallery does the same. */
  function choose(next: { currency?: Currency; period?: Period }) {
    const currencyValue = next.currency ?? currency;
    const periodValue = next.period ?? period;
    if (next.currency) setCurrency(next.currency);
    if (next.period) setPeriod(next.period);
    const url = new URL(window.location.href);
    url.searchParams.set("currency", currencyValue);
    url.searchParams.set("period", periodValue);
    window.history.replaceState(null, "", url);
  }

  const intro = priceFor(currency, period, "intro");
  const normal = compareAtPrice(currency, period);
  const perMonth = period === "yearly" ? monthlyEquivalent(intro, currency) : null;

  return (
    <>
      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4">
        <div
          role="group"
          aria-label="Currency"
          className="flex flex-wrap items-center justify-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
        >
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={currency === c}
              onClick={() => choose({ currency: c })}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors ${
                currency === c
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Billing period"
          className="flex items-center justify-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1"
        >
          {(["monthly", "yearly"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => choose({ period: p })}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-6xl gap-4 px-6 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-xl border bg-card/50 p-6 text-left ${
              plan.id === "pro" ? "border-primary/50" : "border-border/60"
            }`}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

            {/* One price area for all three cards, so the feature lists start
                on the same line whatever the plan says. The price carries its
                own unit on the baseline (leading-none, so the unit does not
                drop to the bottom of the number's line box), and the
                introductory price sits BELOW it as its own line with the
                normal price struck through - a struck price running into the
                sentence beside it reads as one broken line. */}
            <div className="mt-6 min-h-[10rem]">
              {plan.priced ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground">
                      {formatMoney(intro, currency)}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {period === "monthly" ? "/month" : "/year"}
                    </span>
                  </div>

                  {perMonth !== null && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatMoney(perMonth, currency)} a month, billed yearly
                    </p>
                  )}

                  <p className="mt-4 text-sm text-muted-foreground">
                    was{" "}
                    <span className="line-through">{formatMoney(normal, currency)}</span>
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">{INTRO_TERM}</p>

                  {period === "yearly" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Two months free against paying monthly.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold leading-none tracking-tight text-foreground">
                    {plan.id === "free" ? "Free" : "Talk to us"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plan.id === "free"
                      ? "No account, no card, no expiry."
                      : "We set the plan up with you, by hand."}
                  </p>
                </>
              )}
            </div>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-foreground/90">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {plan.ctaHref ? (
                <a href={plan.ctaHref} className={buttonVariants({ variant: "default", size: "lg" })}>
                  {plan.cta}
                </a>
              ) : (
                <a
                  href={plan.ctaAnchor}
                  className={buttonVariants({
                    variant: plan.id === "pro" ? "default" : "outline",
                    size: "lg",
                  })}
                >
                  {plan.cta}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-6 max-w-3xl px-6 text-center text-sm text-muted-foreground">
        {CHECKOUT_NOTE} {TAX_NOTE}
      </p>
    </>
  );
}