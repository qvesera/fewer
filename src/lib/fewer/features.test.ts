// T-099: server-dependent features are OFF in the desktop shell — the shell
// ships no server and no account. Pure tests via cloudFeatureFor.

import { describe, expect, test } from "bun:test";
import { CLOUD_FEATURES, cloudFeatureFor, type CloudFeature } from "./features";

const ALL: CloudFeature[] = [
  "accounts",
  "cloudSave",
  "share",
  "gallery",
  "cloudImport",
  "watch",
  "versionHistory",
  "billing",
];

describe("cloudFeatureFor", () => {
  test("every server feature is OFF in the shell", () => {
    for (const f of ALL) {
      expect(cloudFeatureFor(true, f), f).toBe(false);
    }
  });

  test("every server feature stays ON on the web", () => {
    for (const f of ALL) {
      expect(cloudFeatureFor(false, f), f).toBe(true);
    }
  });

  test("the map covers the full CloudFeature vocabulary", () => {
    expect(Object.keys(CLOUD_FEATURES).sort()).toEqual([...ALL].sort());
  });
});
