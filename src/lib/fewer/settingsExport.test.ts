// T-105: settings export snapshot — pure collector, no DOM.

import { describe, expect, test } from "bun:test";
import {
  SETTINGS_EXPORT_VERSION,
  collectSettingsExport,
  isSettingsExportKey,
  settingsExportFilename,
} from "./settingsExport";

const STORAGE: Record<string, string | null> = {
  "fewer-user-settings": "{\"version\":1}",
  "fewer:panelLayout": "{\"tree\":[]}",
  "fewer-theme": "dark",
  "other-app-key": "must-not-leak",
};

function read(key: string): string | null {
  return STORAGE[key] ?? null;
}

describe("isSettingsExportKey", () => {
  test("accepts Fewer's own keys (dash and colon namespaces)", () => {
    expect(isSettingsExportKey("fewer-user-settings")).toBe(true);
    expect(isSettingsExportKey("fewer:panelLayout")).toBe(true);
    expect(isSettingsExportKey("fewer-theme")).toBe(true);
  });

  test("rejects foreign keys", () => {
    expect(isSettingsExportKey("other-app-key")).toBe(false);
    expect(isSettingsExportKey("")).toBe(false);
  });
});

describe("collectSettingsExport", () => {
  test("snapshots only fewer* keys that are present", () => {
    const snap = collectSettingsExport({
      keys: Object.keys(STORAGE),
      read,
      now: new Date("2026-10-08T10:00:00.000Z"),
      host: true,
    });
    expect(Object.keys(snap.entries)).toEqual([
      "fewer-theme",
      "fewer-user-settings",
      "fewer:panelLayout",
    ]);
    expect(snap.entries["fewer-theme"]).toBe("dark");
    expect(snap.entries["other-app-key"]).toBeUndefined();
  });

  test("envelope carries version, kind, timestamp, and host flag", () => {
    const snap = collectSettingsExport({
      keys: ["fewer-theme"],
      read,
      now: new Date("2026-10-08T10:00:00.000Z"),
      host: true,
    });
    expect(snap.app).toBe("fewer");
    expect(snap.kind).toBe("settings-export");
    expect(snap.version).toBe(SETTINGS_EXPORT_VERSION);
    expect(snap.exportedAt).toBe("2026-10-08T10:00:00.000Z");
    expect(snap.host).toBe(true);
  });

  test("skips keys whose value reads back null (deleted mid-snapshot)", () => {
    const snap = collectSettingsExport({
      keys: ["fewer-user-settings", "fewer-gone"],
      read: (k) => (k === "fewer-gone" ? null : STORAGE[k] ?? null),
    });
    expect(snap.entries).toEqual({ "fewer-user-settings": "{\"version\":1}" });
    expect(snap.host).toBe(false);
  });

  test("defaults exportedAt to now", () => {
    const snap = collectSettingsExport({ keys: [], read });
    expect(Number.isNaN(Date.parse(snap.exportedAt))).toBe(false);
  });
});

describe("settingsExportFilename", () => {
  test("is a timestamped few-settings json name", () => {
    expect(settingsExportFilename(1760000000000)).toBe("fewer-settings-1760000000000.json");
  });
});
