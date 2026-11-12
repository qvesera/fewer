/**
 * The pricing page (T-257): the numbers, the copy and the currency rules, in
 * one pure module so the page renders from data and the arithmetic is
 * testable.
 *
 * Two rules the copy depends on:
 *
 * - The yearly price is DERIVED from the monthly one (twelve months, less
 *   20%), never typed twice. A discount that is computed cannot drift away
 *   from the price it discounts.
 * - The introductory price is a separate number, and the normal price is
 *   shown next to it, struck through. The term is part of the offer, so it
 *   is written down here rather than left to whoever edits the page.
 *
 * The prices are display prices. There is no checkout: `BILLING_ENABLED` is
 * off, the Plans doc page is unpublished, and a plan is granted by hand. The
 * copy must therefore never promise a purchase path that does not exist,
 * which the test pins.
 */

export type Currency = "USD" | "GBP" | "EUR" | "INR";
export type Period = "monthly" | "yearly";
export type PriceKind = "intro" | "normal";

export const CURRENCIES: Currency[] = ["USD", "GBP", "EUR", "INR"];

/** The monthly prices, per currency. The yearly price is derived. */
export const MONTHLY_PRICES: Record<Currency, Record<PriceKind, number>> = {
  USD: { intro: 6.99, normal: 9.99 },
  GBP: { intro: 5.99, normal: 7.99 },
  EUR: { intro: 6.99, normal: 9.99 },
  INR: { intro: 599, normal: 999 },
};

/** The yearly plan is twelve months at 20% off. */
export const YEARLY_DISCOUNT = 0.2;

/** Currencies whose smallest unit is the whole number (rupees). */
const ZERO_DECIMAL_CURRENCIES: Currency[] = ["INR"];

function decimalsFor(currency: Currency): number {
  return ZERO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2;
}

/** Round to the currency's own precision, so rupees stay whole. */
function roundForCurrency(value: number, currency: Currency): number {
  const factor = 10 ** decimalsFor(currency);
  return Math.round(value * factor) / factor;
}

/** The yearly price for a monthly one: twelve months, 20% off. */
export function yearlyPrice(monthly: number, currency: Currency): number {
  return roundForCurrency(monthly * 12 * (1 - YEARLY_DISCOUNT), currency);
}

/** What a yearly plan costs per month, for the "x/mo" line. */
export function monthlyEquivalent(yearly: number, currency: Currency): number {
  return roundForCurrency(yearly / 12, currency);
}

/** The price for a currency, period and kind (introductory or normal). */
export function priceFor(
  currency: Currency,
  period: Period,
  kind: PriceKind = "intro",
): number {
  const monthly = MONTHLY_PRICES[currency][kind];
  return period === "monthly" ? monthly : yearlyPrice(monthly, currency);
}

/** The struck-through price next to the introductory one. */
export function compareAtPrice(currency: Currency, period: Period): number {
  return priceFor(currency, period, "normal");
}

/** Money, formatted by the currency's own rules (rupees whole, others 2dp). */
export function formatMoney(amount: number, currency: Currency): string {
  const decimals = decimalsFor(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * The currency to show first, guessed from the browser's locale. A guess, not
 * a detection: the visitor picks another one with the switcher, and the
 * choice travels in the URL so a link shows the same price to everyone.
 */
export function currencyForLocale(locale: string | undefined): Currency {
  const region = (locale ?? "").split(/[-_]/)[1]?.toUpperCase();
  if (region === "GB") return "GBP";
  if (region === "IN") return "INR";
  if (["EUR", "DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI"].includes(region ?? "")) {
    return "EUR";
  }
  return "USD";
}

export const INTRO_TERM = "Introductory price for your first 12 months";

export const TAX_NOTE = "Prices exclude taxes. GST or VAT is added where it applies.";

export const CHECKOUT_NOTE =
  "Self-serve checkout is not open yet; until then a plan is set up by hand.";

export interface PricingPlan {
  id: "free" | "pro" | "enterprise";
  name: string;
  tagline: string;
  /** The bullets, in the order they matter. */
  features: string[];
  /** The button label. */
  cta: string;
  /** Where the button goes: a page on this site, or the contact form. */
  ctaHref?: string;
  ctaAnchor?: string;
  /** The enterprise card has no price. */
  priced: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "The whole local app, no account, no card.",
    features: [
      "Open a folder, an archive, a URL or a repo",
      "Search every file inside it, even the ones inside a zip",
      "Group, rename, arrange and export in 8 formats",
      "A free account adds 3 saved graphs, 30 days of history and share links",
    ],
    cta: "Launch the app",
    ctaHref: "https://app.fewer.directory/app",
    priced: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For folders that have grown up.",
    features: [
      "Everything in Free, without the fewer credit on exports",
      "The panel workspace: split views, docking, corner grips",
      "Tags, saved themes and unlimited saved graphs",
      "A full year of version history",
      "Watch digests: a nightly crawl and an email when a public index changes",
      "Cloud connectors and invite-only sharing",
    ],
    cta: "Ask about Pro",
    ctaAnchor: "#contact",
    priced: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For teams and organisations.",
    features: [
      "Everything in Pro, for your whole team",
      "Unlimited saves and a year of history per seat",
      "Private sharing, a private gallery and shared theme libraries",
      "Org workspaces and admin controls, as they roll out",
      "We set the plan up with you, by hand",
    ],
    cta: "Contact us",
    ctaAnchor: "#contact",
    priced: false,
  },
];