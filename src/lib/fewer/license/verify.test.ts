// T-090 / #302: offline license policy (parsing, expiry, tier mapping, masks).
// Signature verification itself runs in Rust; these tests cover everything the
// TS side decides on top of it.
import { describe, expect, test } from "bun:test";
import {
  featureDisabled,
  licenseStatus,
  licenseTier,
  licensedDesktopTier,
  parseLicenseFile,
  parseLicensePayload,
  type LicensePayload,
} from "./types";
import { can } from "@/lib/fewer/tiers";

const payload: LicensePayload = {
  format: 1,
  id: "lic_test",
  holder: "Acme",
  kind: "pro",
  expires: null,
  features: null,
  issued_at: "2026-10-01T00:00:00Z",
};

const file = { payload: JSON.stringify(payload), signature: "AAAA" };

describe("license parsing", () => {
  test("parseLicenseFile accepts the file shape", () => {
    expect(parseLicenseFile(JSON.stringify(file))).toEqual(file);
  });

  test("parseLicenseFile rejects non-licenses", () => {
    expect(() => parseLicenseFile("{}")).toThrow();
    expect(() => parseLicenseFile(JSON.stringify({ payload: 1, signature: "x" }))).toThrow();
    expect(() => parseLicenseFile("nope")).toThrow();
  });

  test("parseLicensePayload rejects wrong format/kind", () => {
    expect(() => parseLicensePayload(JSON.stringify({ ...payload, format: 2 }))).toThrow();
    expect(() => parseLicensePayload(JSON.stringify({ ...payload, kind: "platinum" }))).toThrow();
    expect(() => parseLicensePayload(JSON.stringify({ ...payload, id: undefined }))).toThrow();
  });
});

describe("licenseTier policy", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  test("perpetual license → pro", () => {
    expect(licenseTier(payload, now)).toBe("pro");
  });

  test("future expiry → pro; past expiry → null; bad date → null", () => {
    expect(licenseTier({ ...payload, expires: "2027-01-01" }, now)).toBe("pro");
    expect(licenseTier({ ...payload, expires: "2025-01-01" }, now)).toBeNull();
    expect(licenseTier({ ...payload, expires: "not-a-date" }, now)).toBeNull();
  });

  test("enterprise and network kinds also map to pro for now", () => {
    expect(licenseTier({ ...payload, kind: "enterprise" }, now)).toBe("pro");
    expect(licenseTier({ ...payload, kind: "network" }, now)).toBe("pro");
  });
});

describe("licenseStatus + tier merge", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  test("states: none / invalid signature / invalid payload / expired / valid", () => {
    expect(licenseStatus(null, true, now).state).toBe("none");
    expect(licenseStatus(file, false, now).state).toBe("invalid");
    expect(licenseStatus({ payload: "{bad", signature: "AAAA" }, true, now).state).toBe("invalid");
    const expired = licenseStatus(
      { payload: JSON.stringify({ ...payload, expires: "2020-01-01" }), signature: "AAAA" },
      true,
      now,
    );
    expect(expired.state).toBe("expired");
    expect(licenseStatus(file, true, now).state).toBe("valid");
  });

  test("licensedDesktopTier: valid → pro, everything else → null", () => {
    expect(licensedDesktopTier(licenseStatus(file, true, now))).toBe("pro");
    expect(licensedDesktopTier({ state: "none" })).toBeNull();
    expect(licensedDesktopTier({ state: "expired", payload })).toBeNull();
    expect(licensedDesktopTier({ state: "invalid" })).toBeNull();
  });
});

describe("enterprise feature mask", () => {
  test("featureDisabled reads the mask; null mask disables nothing", () => {
    expect(featureDisabled(payload, "localPreview")).toBe(false);
    expect(featureDisabled({ ...payload, features: { localPreview: false } }, "localPreview")).toBe(true);
    expect(featureDisabled({ ...payload, features: { localPreview: true } }, "localPreview")).toBe(false);
  });

  test("desktop features sit at pro in MIN_TIER", () => {
    expect(can("localLibrary", "pro")).toBe(true);
    expect(can("localLibrary", "free")).toBe(false);
    expect(can("localLibrary", "guest")).toBe(false);
    expect(can("nativeBrowse", "pro")).toBe(true);
    expect(can("localPreview", "pro")).toBe(true);
  });
});
