// Server-dependent features all ship on the web — the desktop shell that
// turned them off has moved to the private fewer-desktop repo.

import { describe, expect, test } from "bun:test";
import { CLOUD_FEATURES, type CloudFeature } from "./features";

const ALL: CloudFeature[] = [
  "accounts",
  "cloudSave",
  "share",
  "gallery",
  "cloudImport",
  "watch",
  "versionHistory",
  "billing",
  "bugEmail",
];

describe("CLOUD_FEATURES", () => {
  test("every server feature is ON on the web", () => {
    for (const f of ALL) {
      expect(CLOUD_FEATURES[f], f).toBe(true);
    }
  });

  test("the map covers the full CloudFeature vocabulary", () => {
    expect(Object.keys(CLOUD_FEATURES).sort()).toEqual([...ALL].sort());
  });
});

