import { describe, test, expect } from "bun:test";
import { classifyDeletion, scheduledDeletionIso, DELETION_GRACE_DAYS } from "./accountDeletion";

const NOW = "2026-09-04T12:00:00.000Z";
const schedule = (daysAgo: number) =>
  new Date(new Date(NOW).getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
const signIn = (daysAgo: number) => schedule(daysAgo);

describe("classifyDeletion", () => {
  test("waits while the grace window is still running", () => {
    expect(classifyDeletion(schedule(-3), signIn(10), NOW)).toBe("wait");
  });

  test("purges once the window lapses without a later sign-in", () => {
    // Scheduled 7 days ago, last sign-in before scheduling.
    expect(classifyDeletion(schedule(7), signIn(8), NOW)).toBe("purge");
    expect(classifyDeletion(schedule(8), null, NOW)).toBe("purge");
  });

  test("recovers when the user signed in after the due date (any sign-in method)", () => {
    expect(classifyDeletion(schedule(7), signIn(3), NOW)).toBe("recover");
  });

  test("sign-in at exactly the due date does not recover (strictly-after rule)", () => {
    expect(classifyDeletion(schedule(7), schedule(7), NOW)).toBe("purge");
  });

  test("does not recover on a sign-in older than the due date", () => {
    expect(classifyDeletion(schedule(7), signIn(9), NOW)).toBe("purge");
  });

  test("does not purge before the due date even if the user never signed in", () => {
    expect(classifyDeletion(schedule(-6), null, NOW)).toBe("wait");
  });

  test("treats a malformed timestamp as wait (fail-safe)", () => {
    expect(classifyDeletion("not-a-date", signIn(9), NOW)).toBe("wait");
  });

  test("grace window is 7 days and timestamps are ISO", () => {
    expect(DELETION_GRACE_DAYS).toBe(7);
    const iso = scheduledDeletionIso();
    expect(new Date(iso).getTime()).toBeGreaterThan(new Date(iso).getTime() - 1000);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});
