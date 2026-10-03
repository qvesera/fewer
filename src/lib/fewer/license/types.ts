// Offline license model (T-090 / #302). A license is a JSON payload signed
// with Ed25519; the signature covers the exact payload bytes, so there is no
// canonicalization step — the signer controls the bytes, the verifier checks
// them. Signature verification itself runs in the Rust shell
// (verify_license_sig); everything here is pure parsing + policy.
import type { Tier } from "@/lib/fewer/tiers";

export type LicenseKind = "pro" | "enterprise" | "network";

export interface LicensePayload {
  format: 1;
  id: string;
  holder: string;
  kind: LicenseKind;
  /** ISO date, or null/absent = perpetual. */
  expires: string | null;
  /** Optional per-feature override mask (enterprise: disable features). */
  features: Record<string, boolean> | null;
  issued_at: string;
}

/** File shape on disk (.fewerlicense). */
export interface LicenseFile {
  payload: string;
  signature: string;
}

export type LicenseState = "none" | "valid" | "expired" | "invalid";

export interface LicenseStatus {
  state: LicenseState;
  payload?: LicensePayload;
}

/** Parse + shape-validate the license file. Throws on anything malformed. */
export function parseLicenseFile(raw: string): LicenseFile {
  const f = JSON.parse(raw) as Partial<LicenseFile>;
  if (typeof f?.payload !== "string" || typeof f?.signature !== "string") {
    throw new Error("not a fewer license file");
  }
  return { payload: f.payload, signature: f.signature };
}

/** Parse + shape-validate the payload JSON string. Throws on anything malformed. */
export function parseLicensePayload(json: string): LicensePayload {
  const p = JSON.parse(json) as Partial<LicensePayload>;
  if (
    p?.format !== 1 ||
    typeof p.id !== "string" ||
    typeof p.holder !== "string" ||
    !["pro", "enterprise", "network"].includes(p.kind as string)
  ) {
    throw new Error("unsupported license payload");
  }
  return p as LicensePayload;
}

/**
 * Policy: signature already verified. Expired → null (no tier).
 * All paid kinds currently map to the pro tier; the kind stays on the payload
 * for enterprise/network masks and future differentiation.
 */
export function licenseTier(payload: LicensePayload, now: Date = new Date()): Tier | null {
  if (payload.expires) {
    const t = Date.parse(payload.expires);
    if (Number.isNaN(t) || now.getTime() > t) return null;
  }
  return "pro";
}

/** True when the payload explicitly disables a feature (enterprise mask). */
export function featureDisabled(payload: LicensePayload, feature: string): boolean {
  return payload.features?.[feature] === false;
}

/** Status from a parsed file + signature-verification result. */
export function licenseStatus(
  file: LicenseFile | null,
  signatureOk: boolean,
  now: Date = new Date(),
): LicenseStatus {
  if (!file) return { state: "none" };
  if (!signatureOk) return { state: "invalid" };
  let payload: LicensePayload;
  try {
    payload = parseLicensePayload(file.payload);
  } catch {
    return { state: "invalid" };
  }
  if (licenseTier(payload, now) === null) return { state: "expired", payload };
  return { state: "valid", payload };
}

/** Tier to merge into the app when a valid license is active (null = fall back to account tier). */
export function licensedDesktopTier(status: LicenseStatus): Tier | null {
  return status.state === "valid" ? licenseTier(status.payload as LicensePayload) : null;
}
