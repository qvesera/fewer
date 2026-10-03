// License activation state (T-090 / #302): where the license file lives and
// how the app re-checks it. The license PATH is device-local settings; the
// verification itself is offline (Rust Ed25519 over the stored payload).
//
// Enforcement honesty (same as tiers.ts): this is a best-effort client gate —
// it hides UI, it does not sandbox the binary. Real enforcement would move the
// check behind a signed Rust surface; recorded as the upgrade path.
import { isTauri, nativeFsRead, nativePickLicenseFile, nativeVerifyLicenseSig } from "@/lib/fewer/nativeShell";
import {
  licenseStatus,
  licensedDesktopTier,
  parseLicenseFile,
  type LicensePayload,
  type LicenseStatus,
} from "./types";
import type { Tier } from "@/lib/fewer/tiers";

const KEY = "fewer.licensePath";
const EVENT = "fewer:license-changed";

export function getLicensePath(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function setLicensePath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    if (path) window.localStorage.setItem(KEY, path);
    else window.localStorage.removeItem(KEY);
  } catch {
    // private mode — activation just won't persist
  }
}

/** Notify listeners (FewerApp tier effect) that the license changed. */
export function notifyLicenseChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}
export function onLicenseChanged(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Verify the stored (or given) license file via the shell. */
export async function checkLicense(path?: string): Promise<LicenseStatus> {
  const target = path ?? getLicensePath();
  if (!isTauri() || !target) return { state: "none" };
  try {
    const raw = await nativeFsRead(target);
    const file = parseLicenseFile(raw);
    const sigBytes = Uint8Array.from(atob(file.signature), (c) => c.charCodeAt(0));
    let signatureOk = false;
    try {
      await nativeVerifyLicenseSig(file.payload, Array.from(sigBytes));
      signatureOk = true;
    } catch {
      signatureOk = false;
    }
    return licenseStatus(file, signatureOk);
  } catch {
    return { state: "invalid" };
  }
}

export interface ActivateResult {
  ok: boolean;
  status: LicenseStatus;
  error?: string;
}

/** Pick a .fewerlicense file, verify it, persist the path. */
export async function activateLicense(): Promise<ActivateResult> {
  const path = await nativePickLicenseFile();
  if (!path) return { ok: false, status: { state: "none" }, error: "cancelled" };
  const status = await checkLicense(path);
  if (status.state === "valid") {
    setLicensePath(path);
    notifyLicenseChanged();
    return { ok: true, status };
  }
  const error =
    status.state === "expired"
      ? "This license has expired."
      : status.state === "invalid"
        ? "Signature invalid — not a license issued by Fewer."
        : "Could not read that file.";
  return { ok: false, status, error };
}

export function deactivateLicense(): void {
  setLicensePath("");
  notifyLicenseChanged();
}

/**
 * Desktop tier from the license, or null when it shouldn't apply:
 * not in the shell, no license, expired, or invalid (→ account tier fallback).
 * Mirrors devTierOverride() precedence in FewerApp.
 */
export async function desktopLicensedTier(): Promise<Tier | null> {
  if (!isTauri()) return null;
  const status = await checkLicense();
  return licensedDesktopTier(status);
}

/** Current payload for the Settings license panel (null = none). */
export async function currentLicensePayload(): Promise<LicensePayload | null> {
  const status = await checkLicense();
  return status.payload ?? null;
}
