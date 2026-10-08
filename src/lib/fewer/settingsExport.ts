// T-105: optional settings export — a JSON snapshot of every `fewer*` localStorage
// entry (settings, custom themes, panel layout, search history, tutorial flags,
// license state) for backup or for attaching to a bug report. The collector is
// pure (keys + reader injected) so the snapshot shape is unit-testable without a
// DOM; SettingsDialog's Help tab does the blob download, mirroring the bug
// report's Download button.

export const SETTINGS_EXPORT_VERSION = 1;

export interface SettingsExport {
  app: "fewer";
  kind: "settings-export";
  version: number;
  /** ISO-8601 timestamp the snapshot was taken. */
  exportedAt: string;
  /** True when snapshotted inside a desktop shell (support context). */
  host: boolean;
  /** Raw localStorage values keyed by storage key — only Fewer's own keys. */
  entries: Record<string, string>;
}

/**
 * Fewer's storage only: every key it writes starts with `fewer` (`fewer-user-settings`,
 * `fewer:panelLayout`, `fewer-theme`, …). Foreign keys never leave the browser.
 */
export function isSettingsExportKey(key: string): boolean {
  return key.startsWith("fewer");
}

/** Build the snapshot envelope from the current storage contents. */
export function collectSettingsExport(opts: {
  keys: readonly string[];
  read: (key: string) => string | null;
  now?: Date;
  host?: boolean;
}): SettingsExport {
  const entries: Record<string, string> = {};
  for (const key of [...opts.keys].filter(isSettingsExportKey).sort()) {
    const value = opts.read(key);
    if (value !== null) entries[key] = value;
  }
  return {
    app: "fewer",
    kind: "settings-export",
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    host: opts.host ?? false,
    entries,
  };
}

/** Download filename, mirroring bugReportFilename. */
export function settingsExportFilename(nowMs: number): string {
  return `fewer-settings-${nowMs}.json`;
}
