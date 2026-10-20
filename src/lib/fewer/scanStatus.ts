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
  /** True once the budget stopped the walk — deeper folders need a click. */
  stopped: boolean;
}

const IDLE: ScanStatus = { active: false, root: null, scanned: 0, dirs: 0, stopped: false };

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