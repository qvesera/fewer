import { describe, expect, test } from "bun:test";
import {
  CURRENCIES,
  CHECKOUT_NOTE,
  INTRO_TERM,
  MONTHLY_PRICES,
  PRICING_PLANS,
  TAX_NOTE,
  compareAtPrice,
  currencyForLocale,
  formatMoney,
  monthlyEquivalent,
  priceFor,
} from "./pricing";

/**
 * Pricing guards (T-257).
 *
 * The yearly price is derived, so the 20% claim cannot drift away from the
 * price it discounts - but only if the arithmetic is right for every
 * currency, including the one that has no minor unit. These tests are what
 * makes the page's numbers trustworthy.
 */
describe("the yearly plan", () => {
  test("the yearly price is ten months of the introductory monthly price", () => {
    // The yearly price is a set price, not a percentage off: it is ten months
    // of the introductory monthly one, so a year costs two months less than
    // paying monthly for the same offer. The set price is rounded UP to a
    // round figure (69.99 against 69.90), so the relation is a close one, not
    // an exact one.
    for (const currency of CURRENCIES) {
      const monthly = MONTHLY_PRICES[currency].intro;
      const yearly = priceFor(currency, "yearly", "intro");
      expect(Math.abs(yearly - monthly * 10) / (monthly * 10)).toBeLessThan(0.01);
      // The claim on the card: two months free against paying monthly.
      expect(monthlyEquivalent(yearly, currency)).toBeLessThan(monthly);
    }
  });

  test("the normal yearly price is twelve months of the normal monthly price", () => {
    for (const currency of CURRENCIES) {
      const monthly = MONTHLY_PRICES[currency].normal;
      const yearly = priceFor(currency, "yearly", "normal");
      expect(Math.abs(yearly - monthly * 12)).toBeLessThanOrEqual(0.01);
    }
  });

  test("the yearly price is set, per currency", () => {
    expect(priceFor("USD", "yearly", "intro")).toBe(69.99);
    expect(priceFor("GBP", "yearly", "intro")).toBe(59.99);
    expect(priceFor("EUR", "yearly", "intro")).toBe(69.99);
    expect(priceFor("INR", "yearly", "intro")).toBe(5999);
  });

  test("rupees stay whole numbers", () => {
    expect(priceFor("INR", "yearly", "intro")).toBe(5999);
    expect(formatMoney(5999, "INR")).toContain("5,999");
    expect(formatMoney(5999, "INR")).not.toContain(".");
  });

  test("the yearly monthly-equivalent is the yearly price over twelve", () => {
    expect(monthlyEquivalent(priceFor("USD", "yearly"), "USD")).toBe(5.83);
    expect(monthlyEquivalent(priceFor("GBP", "yearly"), "GBP")).toBe(5);
    expect(monthlyEquivalent(priceFor("INR", "yearly"), "INR")).toBe(500);
  });

  test("the introductory price is below the normal one, in every currency", () => {
    for (const currency of CURRENCIES) {
      expect(MONTHLY_PRICES[currency].intro).toBeLessThan(MONTHLY_PRICES[currency].normal);
      expect(priceFor(currency, "monthly", "intro")).toBeLessThan(
        compareAtPrice(currency, "monthly"),
      );
      expect(priceFor(currency, "yearly", "intro")).toBeLessThan(
        compareAtPrice(currency, "yearly"),
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
