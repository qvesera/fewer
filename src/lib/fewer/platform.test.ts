import { afterEach, describe, expect, test } from "bun:test";
import { isWindowsPlatform } from "./platform";

describe("isWindowsPlatform", () => {
  const originalPlatform = (navigator as { platform?: string }).platform;
  const originalUserAgent = (navigator as { userAgent?: string }).userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform ?? undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent ?? undefined,
      configurable: true,
    });
  });

  test("returns true on Win32 platform", () => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
    expect(isWindowsPlatform()).toBe(true);
  });

  test("returns true on Windows user agent", () => {
    Object.defineProperty(navigator, "platform", { value: "", configurable: true });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
    });
    expect(isWindowsPlatform()).toBe(true);
  });

  test("returns false on Linux platform", () => {
    Object.defineProperty(navigator, "platform", { value: "Linux x86_64", configurable: true });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      configurable: true,
    });
    expect(isWindowsPlatform()).toBe(false);
  });

  test("returns false on macOS platform", () => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      configurable: true,
    });
    expect(isWindowsPlatform()).toBe(false);
  });
});
