import { useSyncExternalStore } from "react";

/**
 * Scan status for progressive folder loading (T-207): a tiny module store the
 * shell header's chip subscribes to. Kept out of the graph store on purpose —
 * scan telemetry changes every directory and must not re-render the canvas.
 */

export interface ScanStatus {
  active: boolean;
  /** Root name being scanned (null when idle). */
  root: string | null;
  scanned: number;
  dirs: number;
  /** True once the budget paused the walk — deeper folders stay loadable. */
  stopped: boolean;
  /** Why it stopped (T-215): budget → resumable; aborted → user stopped it. */
  reason: "budget" | "aborted" | null;
  /** Remaining queue can be resumed from the chip. */
  pending: boolean;
}

const IDLE: ScanStatus = { active: false, root: null, scanned: 0, dirs: 0, stopped: false, reason: null, pending: false };

let status: ScanStatus = IDLE;
const listeners = new Set<() => void>();

export function getScanStatus(): ScanStatus {
  return status;
}

export function setScanStatus(patch: Partial<ScanStatus>): void {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function clearScanStatus(): void {
  setScanStatus(IDLE);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useScanStatus(): ScanStatus {
  return useSyncExternalStore(subscribe, getScanStatus, getScanStatus);
}