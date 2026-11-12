import { describe, expect, test } from "bun:test";
import {
  CURRENCIES,
  CHECKOUT_NOTE,
  INTRO_TERM,
  MONTHLY_PRICES,
  PRICING_PLANS,
  TAX_NOTE,
  YEARLY_DISCOUNT,
  compareAtPrice,
  currencyForLocale,
  formatMoney,
  monthlyEquivalent,
  priceFor,
  yearlyPrice,
} from "./pricing";

/**
 * Pricing guards (T-257).
 *
 * The yearly price is derived, so the 20% claim cannot drift away from the
 * price it discounts - but only if the arithmetic is right for every
 * currency, including the one that has no minor unit. These tests are what
 * makes the page's numbers trustworthy.
 */
describe("the yearly discount", () => {
  test("a yearly plan is twelve months at 20% off", () => {
    for (const currency of CURRENCIES) {
      for (const kind of ["intro", "normal"] as const) {
        const monthly = MONTHLY_PRICES[currency][kind];
        const yearly = yearlyPrice(monthly, currency);
        const saved = 1 - yearly / (monthly * 12);
        // Rounding to the currency's precision moves the figure by a hair.
        expect(Math.abs(saved - YEARLY_DISCOUNT)).toBeLessThan(0.001);
      }
    }
  });

  test("rupees stay whole numbers", () => {
    expect(yearlyPrice(599, "INR")).toBe(5750);
    expect(yearlyPrice(999, "INR")).toBe(9590);
    expect(formatMoney(5750, "INR")).toContain("5,750");
    expect(formatMoney(5750, "INR")).not.toContain(".");
  });

  test("the yearly monthly-equivalent is the yearly price over twelve", () => {
    expect(monthlyEquivalent(yearlyPrice(6.99, "USD"), "USD")).toBe(5.59);
    expect(monthlyEquivalent(yearlyPrice(9.99, "USD"), "USD")).toBe(7.99);
    expect(monthlyEquivalent(yearlyPrice(5.99, "GBP"), "GBP")).toBe(4.79);
  });

  test("the introductory price is below the normal one, in every currency", () => {
    for (const currency of CURRENCIES) {
      expect(MONTHLY_PRICES[currency].intro).toBeLessThan(MONTHLY_PRICES[currency].normal);
      expect(priceFor(currency, "monthly", "intro")).toBeLessThan(
        compareAtPrice(currency, "monthly"),
      );
    }
  });
});

describe("money formatting", () => {
  test("dollars and pounds carry two decimals", () => {
    expect(formatMoney(6.99, "USD")).toBe("$6.99");
    expect(formatMoney(57.5, "GBP")).toBe("£57.50");
  });

  test("rupees carry none", () => {
    expect(formatMoney(599, "INR")).toBe("₹599");
  });
});

describe("the currency guess", () => {
  test("the browser's region picks the currency", () => {
    expect(currencyForLocale("en-GB")).toBe("GBP");
    expect(currencyForLocale("en-IN")).toBe("INR");
    expect(currencyForLocale("de-DE")).toBe("EUR");
    expect(currencyForLocale("en-US")).toBe("USD");
    expect(currencyForLocale(undefined)).toBe("USD");
  });
});

describe("the pricing copy", () => {
  test("no card promises a purchase that does not exist", () => {
    // There is no checkout while billing is off, so the copy may name prices
    // and a contact path, but never a buying action.
    const copy = [
      ...PRICING_PLANS.flatMap((p) => [p.name, p.tagline, p.cta, ...p.features]),
      CHECKOUT_NOTE,
      TAX_NOTE,
      INTRO_TERM,
    ].join(" ");
    expect(copy).not.toMatch(/\bbuy\b|\bsubscribe\b|\bupgrade to\b|\bpurchase\b|pay now/i);
  });

  test("the terms are stated: the intro window, the taxes, the absence of checkout", () => {
    expect(INTRO_TERM).toMatch(/12 months/);
    expect(TAX_NOTE).toMatch(/tax/i);
    expect(CHECKOUT_NOTE).toMatch(/not open yet/i);
  });

  test("exactly one plan carries a price", () => {
    expect(PRICING_PLANS.filter((p) => p.priced).map((p) => p.id)).toEqual(["pro"]);
  });

  test("the paid plans lead to the contact form, not a checkout", () => {
    for (const plan of PRICING_PLANS.filter((p) => !p.ctaHref)) {
      expect(plan.ctaAnchor).toBe("#contact");
    }
  });

  test("the app link follows the deployment's host", () => {
    // A self-hosted build must send readers to its own app, not to the
    // public one.
    const free = PRICING_PLANS.find((p) => p.id === "free")!;
    const expected = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.fewer.directory").replace(/\/$/, "")}/app`;
    expect(free.ctaHref).toBe(expected);
  });
});
